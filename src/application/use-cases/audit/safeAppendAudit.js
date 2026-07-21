/**
 * safeAppendAudit (feature 018)
 *
 * Best-effort audit append shared by the write use-cases. The audit
 * repository is an OPTIONAL dependency (same resilience pattern as
 * GenerateWeeklyAnalysis's allocationTargetsRepository): when absent the call
 * is a no-op, and when the append itself fails the error is logged and
 * swallowed — a write must never fail because its audit row could not be
 * written (research R3).
 *
 * @param {IAuditRepository|null|undefined} auditRepository
 * @param {import('../../interfaces/IAuditRepository').AuditEntry} entry
 * @returns {Promise<void>}
 */

const logger = require('../../../shared/logging');

async function safeAppendAudit(auditRepository, entry) {
  if (!auditRepository) return;
  try {
    await auditRepository.append(entry);
  } catch (err) {
    logger.error('Audit append failed (write already applied)', {
      operation: entry && entry.operation,
      targetId: entry && entry.targetId,
      error: err && err.message,
    });
  }
}

module.exports = safeAppendAudit;
