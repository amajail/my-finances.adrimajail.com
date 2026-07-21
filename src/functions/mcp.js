/**
 * MCP (Model Context Protocol) server tools.
 *
 * Exposes read-only portfolio data as MCP tools so remote clients (e.g. Claude
 * Desktop custom connectors) can query positions, the portfolio summary, and
 * weekly analyses. Hosted in-process by the Azure Functions MCP extension on the
 * separate `/runtime/webhooks/mcp` endpoint (Streamable HTTP) — the existing
 * `authLevel: 'function'` HTTP API under `/api/*` is untouched.
 *
 * Each tool is thin: read args from `context.triggerMetadata.mcptoolargs`, call
 * the same DI-container use-case the HTTP endpoints use, and return a JSON string
 * (MCP tool results are strings, not the `{ status, jsonBody }` HTTP shape, so we
 * do NOT reuse `_shared.js`'s `ok`/`mapError`).
 */

const { app } = require('@azure/functions');
const container = require('./../application/di/container');
const logger = require('../shared/logging');

/**
 * Wrap a tool handler so args are normalized and errors become a JSON `{ error }`
 * string instead of throwing (a thrown error surfaces to the client as an opaque
 * failure; an `{ error }` payload is legible to the model).
 * @param {string} toolName
 * @param {(args: Object) => Promise<any>} fn - receives the parsed tool args
 */
function tool(toolName, fn) {
  return async (_toolArgs, context) => {
    const args = (context && context.triggerMetadata && context.triggerMetadata.mcptoolargs) || {};
    try {
      const result = await fn(args);
      return JSON.stringify(result);
    } catch (err) {
      logger.error(`MCP tool ${toolName} failed`, { error: err && err.message });
      return JSON.stringify({ error: (err && err.message) || 'unknown error' });
    }
  };
}

// ---------------------------------------------------------------------------
// list_positions
// ---------------------------------------------------------------------------
app.mcpTool('mcpListPositions', {
  toolName: 'list_positions',
  description:
    'List portfolio positions, optionally filtered by broker and status. ' +
    'Returns each position with quantity, average cost (PPC), current price, currency, and computed id.',
  toolProperties: [
    {
      propertyName: 'broker',
      propertyType: 'string',
      description: 'Broker slug to filter by: galicia | iol | ibkr | bullmarket | cash. Omit for all brokers.',
      isRequired: false,
    },
    {
      propertyName: 'status',
      propertyType: 'string',
      description: "Position status: open | closed. Defaults to open. Ignored when a broker is given (broker returns all statuses).",
      isRequired: false,
    },
  ],
  handler: tool('list_positions', async (args) => {
    const positions = await container.getListPositions().execute({
      broker: args.broker || undefined,
      status: args.status || 'open',
    });
    return { count: positions.length, positions };
  }),
});

// ---------------------------------------------------------------------------
// portfolio_summary
// ---------------------------------------------------------------------------
app.mcpTool('mcpPortfolioSummary', {
  toolName: 'portfolio_summary',
  description:
    'Get the full portfolio summary: totals, per-position snapshot, last price refresh time, and the MEP (dólar bolsa) rate used for ARS→USD conversion.',
  toolProperties: [],
  handler: tool('portfolio_summary', async () => {
    return container.getGetPortfolioSummary().execute({});
  }),
});

// ---------------------------------------------------------------------------
// list_weekly_analyses
// ---------------------------------------------------------------------------
app.mcpTool('mcpListWeeklyAnalyses', {
  toolName: 'list_weekly_analyses',
  description:
    'List past weekly AI portfolio analyses, newest first. Returns date, status, and (for completed runs) a short summary. Use get_weekly_analysis with a date for full detail.',
  toolProperties: [
    {
      propertyName: 'limit',
      propertyType: 'integer',
      description: 'Maximum number of analyses to return (1-200, default 20).',
      isRequired: false,
    },
  ],
  handler: tool('list_weekly_analyses', async (args) => {
    const parsed = parseInt(args.limit, 10);
    const limit = Number.isNaN(parsed) ? 20 : Math.max(1, Math.min(200, parsed));
    const rows = await container.getAnalysisRepository().getLatest(limit);
    const items = rows.map((a) => {
      const base = {
        date: a.date,
        status: a.status,
        generatedAt: a.generatedAt instanceof Date ? a.generatedAt.toISOString() : a.generatedAt,
      };
      return a.isCompleted()
        ? { ...base, summary: a.summary }
        : { ...base, errorMessage: a.errorMessage };
    });
    return { count: items.length, items };
  }),
});

// ---------------------------------------------------------------------------
// get_weekly_analysis
// ---------------------------------------------------------------------------
app.mcpTool('mcpGetWeeklyAnalysis', {
  toolName: 'get_weekly_analysis',
  description:
    'Get the full detail of one weekly AI portfolio analysis by date (YYYY-MM-DD), including the summary, narrative body, and recommended orders with their execution status.',
  toolProperties: [
    {
      propertyName: 'date',
      propertyType: 'string',
      description: 'The analysis date in YYYY-MM-DD format (see list_weekly_analyses for available dates).',
      isRequired: true,
    },
  ],
  handler: tool('get_weekly_analysis', async (args) => {
    const date = args.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return { error: 'invalid date format; expected YYYY-MM-DD' };
    }
    const result = await container.getAnalysisRepository().getByDate(date);
    if (!result) {
      return { error: `no analysis exists for ${date}` };
    }
    const { analysis, orders } = result;
    const body = {
      date: analysis.date,
      status: analysis.status,
      generatedAt: analysis.generatedAt instanceof Date ? analysis.generatedAt.toISOString() : analysis.generatedAt,
      modelUsed: analysis.modelUsed,
      portfolioTotals: analysis.portfolioTotals || null,
      macroContext: analysis.macroContext || null,
    };
    if (analysis.isCompleted()) {
      body.summary = analysis.summary;
      body.markdownBody = analysis.markdownBody;
      body.orders = (orders || []).map((o) => ({
        index: o.index,
        broker: o.broker,
        symbol: o.symbol,
        side: o.side,
        quantity: o.quantity,
        rationale: o.rationale,
        conviction: o.conviction,
        executionStatus: o.executionStatus || 'pending',
      }));
    } else {
      body.errorMessage = analysis.errorMessage;
      body.orders = [];
    }
    return body;
  }),
});
