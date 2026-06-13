/**
 * Fixed analysis guardrails (feature 010, FR-014..FR-019).
 *
 * The guardrail preamble is prepended to the owner-edited instructions body to
 * form the effective system prompt (preamble ⊕ body). It is a committed file —
 * never editable from the dashboard — so no save path can remove it. The
 * editing guide is owner-facing help shown alongside the instructions editor.
 *
 * Both are generic, holdings-free text (FR-019), safe to commit and display.
 */

const fs = require('fs');
const path = require('path');

const GUARDRAIL_PREAMBLE = fs.readFileSync(path.join(__dirname, 'guardrail-preamble-v1.md'), 'utf8').trim();
const EDITING_GUIDE = fs.readFileSync(path.join(__dirname, 'editing-guide-v1.md'), 'utf8').trim();

/**
 * Compose the effective system prompt: fixed preamble, then the owner body.
 * @param {string} instructionsBody
 * @returns {string}
 */
function buildSystemPrompt(instructionsBody) {
  return `${GUARDRAIL_PREAMBLE}\n\n${instructionsBody}`;
}

module.exports = { GUARDRAIL_PREAMBLE, EDITING_GUIDE, buildSystemPrompt };
