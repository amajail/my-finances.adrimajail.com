/**
 * IMF status classification tool schema (feature 006).
 *
 * The Anthropic `tool_use` schema for the small classification call that maps
 * the trailing week's IMF/Argentina news to a fixed status enum (FR-007/FR-022).
 * The call input carries ONLY public IMF news text — never portfolio data.
 *
 * Mirrors specs/006-weekly-context-capture/contracts/imf-classify-tool.json.
 */

module.exports = {
  name: 'submit_imf_status',
  description:
    'Classify the current IMF program review status for Argentina based ONLY on the provided IMF press-release/news snippets from the trailing week. If the snippets do not clearly indicate a status, return "unknown". Never infer from outside knowledge.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'asOf'],
    properties: {
      status: {
        type: 'string',
        enum: ['none', 'pending', 'staff-level-agreement', 'approved', 'disbursement', 'unknown'],
        description:
          'none = no active program/review; pending = review underway/announced but not concluded; staff-level-agreement = SLA reached pending board; approved = board completed/approved the review; disbursement = a tranche disbursement confirmed; unknown = snippets insufficient to classify.',
      },
      asOf: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
        description: 'ISO date (YYYY-MM-DD) of the most recent news item the status is based on.',
      },
    },
  },
};
