/**
 * The submit_analysis tool schema exists twice: the runtime copy in src/
 * (production must never depend on the specs/ tree being deployed) and the
 * documentation copy in the feature 002 contracts. This test pins them
 * together so they cannot drift silently.
 */

const runtimeSchema = require('../../../../../src/application/use-cases/analysis/submit-analysis-tool.json');
const specSchema = require('../../../../../specs/002-weekly-rebalance-analysis/contracts/submit-analysis-tool.json');

describe('submit-analysis tool schema copies', () => {
  it('runtime copy (src/) matches the spec contract copy field-for-field', () => {
    expect(runtimeSchema.name).toBe(specSchema.name);
    expect(runtimeSchema.description).toBe(specSchema.description);
    expect(runtimeSchema.input_schema).toEqual(specSchema.input_schema);
  });
});
