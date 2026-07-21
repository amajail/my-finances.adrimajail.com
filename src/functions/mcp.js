/**
 * MCP (Model Context Protocol) server tools.
 *
 * Exposes the owner's portfolio as MCP tools so remote clients (e.g. Claude
 * Desktop custom connectors) can query positions, the portfolio summary, and
 * weekly analyses — and, since feature 018, maintain the portfolio via four
 * write tools (update_position, create_position, set_order_execution_status,
 * trigger_price_refresh) plus the list_audit_entries read tool. There is
 * deliberately NO delete tool (spec FR-001): retiring a holding is done via
 * update_position with status "closed". Hosted in-process by the Azure
 * Functions MCP extension on the separate `/runtime/webhooks/mcp` endpoint
 * (Streamable HTTP, behind the platform system key) — the existing
 * `authLevel: 'function'` HTTP API under `/api/*` is untouched.
 *
 * Each tool is thin: read args from `context.triggerMetadata.mcptoolargs`, call
 * the same DI-container use-case the HTTP endpoints use (so writes get the
 * exact same domain validation as the dashboard path, spec FR-003), and return
 * a JSON string (MCP tool results are strings, not the `{ status, jsonBody }`
 * HTTP shape, so we do NOT reuse `_shared.js`'s `ok`/`mapError`).
 */

const { app } = require('@azure/functions');
const container = require('./../application/di/container');
const logger = require('../shared/logging');

/**
 * Wrap a tool handler so args are normalized and errors become a JSON `{ error }`
 * string instead of throwing (a thrown error surfaces to the client as an opaque
 * failure; an `{ error }` payload is legible to the model). Feature 018 (FR-007):
 * the payload also carries the error class as `code` and any field-level
 * `validationErrors` as `details`, so an agent can self-correct a rejected write
 * without external documentation.
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
      return JSON.stringify({
        error: (err && err.message) || 'unknown error',
        code: (err && err.name) || undefined,
        details: (err && err.validationErrors) || undefined,
      });
    }
  };
}

/**
 * Parse an optionally-string-typed numeric tool arg. MCP toolProperties are
 * flat, and clients may send numbers as strings — normalize here so use-cases
 * see real numbers (an unparseable value becomes NaN and is rejected by the
 * same domain validation as the dashboard path).
 * @param {*} value
 * @returns {number|undefined} undefined when the arg was not provided
 */
function toNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
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
        executionPrice: o.executionPrice != null ? o.executionPrice : null,
      }));
    } else {
      body.errorMessage = analysis.errorMessage;
      body.orders = [];
    }
    return body;
  }),
});

// ---------------------------------------------------------------------------
// update_position (feature 018, US2)
// ---------------------------------------------------------------------------
app.mcpTool('mcpUpdatePosition', {
  toolName: 'update_position',
  description:
    'Partially update an existing position. Only the provided fields change; omitted or null fields ' +
    'keep their stored values (a null averageCost never overwrites the stored cost basis). ' +
    'Quantity changes beyond the configured threshold (default 50%), including any reduction to zero, ' +
    'are rejected unless confirm is "true". To retire a holding set status to "closed" — there is no delete tool.',
  toolProperties: [
    {
      propertyName: 'broker',
      propertyType: 'string',
      description: 'Broker slug the position belongs to: galicia | iol | ibkr | bullmarket | cash.',
      isRequired: true,
    },
    {
      propertyName: 'rowKey',
      propertyType: 'string',
      description: 'Position row key: {assetType}__{symbol} (e.g. "cedear__GOOGL", "bond__GD35"; see list_positions ids).',
      isRequired: true,
    },
    {
      propertyName: 'quantity',
      propertyType: 'string',
      description: 'New quantity (non-negative number). Large changes require confirm: "true".',
      isRequired: false,
    },
    {
      propertyName: 'averageCost',
      propertyType: 'string',
      description: 'New average cost per unit (PPC, non-negative number). Omit to preserve the stored value.',
      isRequired: false,
    },
    {
      propertyName: 'notes',
      propertyType: 'string',
      description: 'Free-form notes for the position.',
      isRequired: false,
    },
    {
      propertyName: 'status',
      propertyType: 'string',
      description: 'Position status: open | closed.',
      isRequired: false,
    },
    {
      propertyName: 'maturityDate',
      propertyType: 'string',
      description: 'Maturity date (ISO YYYY-MM-DD) for fixed-income positions.',
      isRequired: false,
    },
    {
      propertyName: 'confirm',
      propertyType: 'string',
      description: 'Set to "true" to confirm an over-threshold quantity change intentionally.',
      isRequired: false,
    },
  ],
  handler: tool('update_position', async (args) => {
    return container.getGuardedUpdatePosition().execute({
      brokerId: args.broker,
      rowKey: args.rowKey,
      quantity: toNumber(args.quantity),
      averageCost: toNumber(args.averageCost),
      notes: args.notes !== undefined && args.notes !== null ? args.notes : undefined,
      status: args.status || undefined,
      maturityDate: args.maturityDate || undefined,
      confirm: args.confirm === true || String(args.confirm).toLowerCase() === 'true',
    });
  }),
});

// ---------------------------------------------------------------------------
// create_position (feature 018, US3)
// ---------------------------------------------------------------------------
app.mcpTool('mcpCreatePosition', {
  toolName: 'create_position',
  description:
    'Create a new position at a broker with full validation. Rejects duplicates of an existing ' +
    'position (same broker + assetType + symbol) with a pointer to the existing record.',
  toolProperties: [
    {
      propertyName: 'broker',
      propertyType: 'string',
      description: 'Broker slug: galicia | iol | ibkr | bullmarket | cash.',
      isRequired: true,
    },
    {
      propertyName: 'assetType',
      propertyType: 'string',
      description: 'Asset type: stock | etf | bond | cedear | cash | deposit | bopreal | lecap | on.',
      isRequired: true,
    },
    {
      propertyName: 'symbol',
      propertyType: 'string',
      description: 'Instrument symbol (e.g. "GOOGL", "GD35").',
      isRequired: true,
    },
    {
      propertyName: 'quantity',
      propertyType: 'string',
      description: 'Quantity held (non-negative number).',
      isRequired: true,
    },
    {
      propertyName: 'averageCost',
      propertyType: 'string',
      description: 'Average cost per unit (PPC, non-negative number). Bonds/BOPREAL are quoted per 100 nominales.',
      isRequired: true,
    },
    {
      propertyName: 'currency',
      propertyType: 'string',
      description: 'Position currency (e.g. USD, ARS).',
      isRequired: true,
    },
    {
      propertyName: 'displayName',
      propertyType: 'string',
      description: 'Optional human-friendly name for the position.',
      isRequired: false,
    },
    {
      propertyName: 'maturityDate',
      propertyType: 'string',
      description: 'Optional maturity date (ISO YYYY-MM-DD) for fixed-income positions.',
      isRequired: false,
    },
    {
      propertyName: 'notes',
      propertyType: 'string',
      description: 'Optional free-form notes.',
      isRequired: false,
    },
  ],
  handler: tool('create_position', async (args) => {
    return container.getAddPosition().execute({
      brokerId: args.broker,
      assetType: args.assetType,
      symbol: args.symbol,
      quantity: toNumber(args.quantity),
      averageCost: toNumber(args.averageCost),
      currency: args.currency,
      displayName: args.displayName || undefined,
      maturityDate: args.maturityDate || undefined,
      notes: args.notes || undefined,
      _audit: { source: 'mcp' },
    });
  }),
});

// ---------------------------------------------------------------------------
// set_order_execution_status (feature 018, US1)
// ---------------------------------------------------------------------------
app.mcpTool('mcpSetOrderExecutionStatus', {
  toolName: 'set_order_execution_status',
  description:
    'Record what happened with a suggested order from a weekly analysis: pending | executed | partial | skipped, ' +
    'with an optional execution price (kept for future outcome-P&L scoring) and note. ' +
    'Identifies the order by analysis date + 0-based index (see get_weekly_analysis).',
  toolProperties: [
    {
      propertyName: 'date',
      propertyType: 'string',
      description: 'The analysis date in YYYY-MM-DD format.',
      isRequired: true,
    },
    {
      propertyName: 'index',
      propertyType: 'integer',
      description: 'The 0-based index of the order within that analysis.',
      isRequired: true,
    },
    {
      propertyName: 'status',
      propertyType: 'string',
      description: 'Execution outcome: pending | executed | partial | skipped.',
      isRequired: true,
    },
    {
      propertyName: 'executionPrice',
      propertyType: 'string',
      description: 'Optional price actually obtained (positive number, e.g. "42.50").',
      isRequired: false,
    },
    {
      propertyName: 'note',
      propertyType: 'string',
      description: 'Optional note (max 500 chars), e.g. why an order was skipped.',
      isRequired: false,
    },
  ],
  handler: tool('set_order_execution_status', async (args) => {
    return container.getSetOrderExecutionStatus().execute({
      date: args.date,
      index: args.index,
      status: args.status,
      executionPrice: toNumber(args.executionPrice),
      note: args.note || undefined,
      _audit: { source: 'mcp' },
    });
  }),
});

// ---------------------------------------------------------------------------
// list_audit_entries (feature 018, FR-006)
// ---------------------------------------------------------------------------
app.mcpTool('mcpListAuditEntries', {
  toolName: 'list_audit_entries',
  description:
    'List recent write-audit entries (newest first). Every write performed through the MCP tools ' +
    'or the API is recorded with timestamp, operation, target, field-level old/new values, and ' +
    'whether the over-threshold confirmation flag was used.',
  toolProperties: [
    {
      propertyName: 'limit',
      propertyType: 'integer',
      description: 'Maximum number of entries to return (1-100, default 20).',
      isRequired: false,
    },
  ],
  handler: tool('list_audit_entries', async (args) => {
    return container.getListAuditEntries().execute({ limit: args.limit });
  }),
});
