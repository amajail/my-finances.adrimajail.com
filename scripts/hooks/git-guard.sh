#!/usr/bin/env bash
# Claude Code PreToolUse guard on Bash. Registered in .claude/settings.json.
#
# The matcher fires on EVERY Bash call, and Node startup costs 100-300 ms, so
# grep the raw payload and bail before spawning Node for the 95% case.
#
# The grep is deliberately unanchored. Matching the JSON structure
# ("command"\s*:\s*"[^"]*git +add) breaks on any quoted segment before the verb
# — `cd "/a b" && git add secret` would slip past. Over-triggering is harmless
# here (privacy-scan re-decides precisely); under-triggering is the failure.
#
# Any non-zero exit is a non-blocking error in Claude Code: the tool proceeds.
# That is the intended fail-open behaviour — a guard that blocks all work gets
# deleted, and then nothing is enforced anywhere. CI is the real guarantee.

input=$(cat)

printf '%s' "$input" | grep -qE 'git[[:space:]]+(add|commit|push)' || exit 0

printf '%s' "$input" | node "${CLAUDE_PROJECT_DIR:-.}/scripts/privacy-scan.js" --hook
