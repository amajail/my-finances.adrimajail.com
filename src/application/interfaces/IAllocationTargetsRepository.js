/**
 * IAllocationTargetsRepository Interface
 *
 * Repository interface for the machine-readable allocation targets document
 * (010-structured-analysis-tables).
 *
 * Backed at the infrastructure layer by AzureAllocationTargetsRepository, which
 * reads the `portfolioSettings` row `partitionKey='settings',
 * rowKey='analysis.allocationTargetsV1'` and parses its JSON value.
 *
 * The targets drive the CODE-COMPUTED sections (bucket drift, asset-class
 * drift, concentration caps). They are owner-maintained and seeded from a
 * gitignored local file — only a placeholder template is committed (Privacy
 * First). See contracts/allocation-targets.schema.json for the shape.
 */

/**
 * @interface
 */
class IAllocationTargetsRepository {
  /**
   * Get the active allocation-targets document.
   *
   * @returns {Promise<{ version: number, buckets: Array, concentrationCaps?: Array }|null>}
   *   Resolves to null when the settings row is absent OR its value is empty/
   *   malformed (so callers can omit the code-computed sections gracefully —
   *   FR-001a / Edge: targets unavailable). Never throws for a missing row.
   * @abstract
   */
  async getActive() {
    throw new Error('Method not implemented: getActive');
  }
}

module.exports = IAllocationTargetsRepository;
