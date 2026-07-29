# CLAUDE.md corrections log

One row per time repo guidance failed and was fixed. Written by `/claude-md-fix`.

Deliberately kept out of `CLAUDE.md` and never `@import`ed: it grows without bound,
and history is only needed when deciding whether a rule has earned graduation.

**Graduation rule:** if the same rule appears here 3 times, prose has failed. It must
become an entry in `.gitignore`, a rule in `.privacy-scan.json`, or — if the shared engine
itself must change — a check in `amajail/dev-kit` with a test in the same PR; otherwise it
is deleted as unenforceable. Grep this file before filing a fourth prose tweak.

Rows below name the enforcement that existed when they were written. `scripts/privacy-scan.js`
and `scripts/hooks/git-guard.sh` lived in this repo until PR #53 moved them to `amajail/dev-kit`;
the rows are history and are deliberately left as written.

Classes: **A** hard + machine-checkable (→ hook/gitignore, prose deleted) · **B** hard,
not checkable (→ rewritten to name the replacement) · **C** preference (→ plain or
deleted) · **D** already stated correctly and ignored (→ moved earlier, promoted to a
hook, or deleted — never restated louder).

| Date | What went wrong | Sentence that permitted it | Class | Where the fix landed |
|---|---|---|---|---|
| 2026-07-23 | `docs/portfolio-framework-v3.md` and `docs/plan-h2-2026.md` sat untracked but unignored for days; any `git add -A` would have published real strategy and personal financial figures. | CLAUDE.md: "kept locally at `docs/portfolio-framework-v3.md`, untracked — real strategy data, never commit" — a claim about the world, not an instruction, and the claim was false. | A | `.gitignore` gains default-deny `docs/private/`; both docs moved there. `PRIVATE_PATHS` in `scripts/privacy-scan.js` covers `docs/private/**`. Prose replaced with "private docs go in `docs/private/`". |
| 2026-07-23 | The pre-staging privacy rule was unrunnable: "scan the diff for real symbols + quantities + PPCs together" has no defined procedure and no tool, so it was never actually done. | CLAUDE.md: "Before any `git add` / commit: … scan the diff … If in doubt, ask the user before staging." | A | `scripts/privacy-scan.js` + `scripts/hooks/git-guard.sh` (PreToolUse hook) + `privacy` job in `.github/workflows/pr-checks.yml`. Prose deleted from both CLAUDE.md and constitution §I. |
| 2026-07-23 | The guard blocked a legitimate `gh pr create`: the PR body, written via heredoc, quoted `(git add -f x)` from the bypass-testing notes, and subshell splitting turned that quoted text into an apparent force-add. Documenting the guard tripped the guard. | n/a — a scanner false positive, not a CLAUDE.md sentence. Surfaced by following "NEVER work around a block — fix the file or ask" rather than rephrasing the PR body. | A | `stripHeredocs()` in `scripts/privacy-scan.js`: heredoc bodies are data, not commands. Regression tests cover quoted, unquoted and `<<-` delimiters, and confirm a real command outside the heredoc is still caught. |
| 2026-07-23 | Constitution §III ("`positions.json` MUST stay in sync after any change") contradicted CLAUDE.md and, per Governance, silently won — implying a re-sync after every MCP write that nobody performed. | Constitution §III: "`scripts/positions.json` is the canonical local snapshot of holdings and MUST stay in sync with the database after any change." | B | Constitution amended to 1.2.0: `positions.json` restated as a recovery snapshot regenerated on demand; MCP write tools named as the primary write path. |
