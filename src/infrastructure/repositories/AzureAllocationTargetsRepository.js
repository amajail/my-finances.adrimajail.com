/**
 * Azure Allocation Targets Repository
 *
 * Implementation of IAllocationTargetsRepository. Reads the machine-readable
 * allocation-targets document from the `portfolioSettings` row
 * `analysis.allocationTargetsV1` (stored as a JSON string) and parses it.
 *
 * Resilient by design (FR-001a / Edge: targets unavailable): a missing row,
 * an empty value, or malformed JSON all resolve to `null` so the caller omits
 * the code-computed sections rather than failing the analysis run.
 *
 * Feature: 010-structured-analysis-tables.
 */

const IAllocationTargetsRepository = require('../../application/interfaces/IAllocationTargetsRepository');
const logger = require('../../shared/logging');

const SETTINGS_KEY = 'analysis.allocationTargetsV1';

class AzureAllocationTargetsRepository extends IAllocationTargetsRepository {
  /**
   * @param {ISettingsRepository} settingsRepository - Reused for the underlying
   *   `portfolioSettings` access (the targets live in one settings row).
   */
  constructor(settingsRepository) {
    super();
    this._settingsRepository = settingsRepository;
  }

  /**
   * @returns {Promise<Object|null>} Parsed targets document, or null when the
   *   row is absent / empty / malformed.
   */
  async getActive() {
    let raw;
    try {
      raw = await this._settingsRepository.get(SETTINGS_KEY);
    } catch (err) {
      logger.warn(`Failed to read ${SETTINGS_KEY}; treating targets as unavailable`, err);
      return null;
    }
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.buckets)) {
        logger.warn(`${SETTINGS_KEY} is present but not a valid targets document; treating as unavailable`);
        return null;
      }
      return parsed;
    } catch (err) {
      logger.warn(`Could not parse ${SETTINGS_KEY}; treating targets as unavailable`, err);
      return null;
    }
  }
}

module.exports = AzureAllocationTargetsRepository;
