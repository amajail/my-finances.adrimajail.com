---
name: claude-md-fix
description: Fix the repo guidance that let Claude get something wrong. Finds the CLAUDE.md sentence (or gap) that permitted the error, classifies it, and lands the fix where it will actually hold — a hook check, a .gitignore entry, the constitution, or a rewritten line in CLAUDE.md. Use when the owner corrects Claude on a repo convention, or after a privacy-scan block that turned out to be wrong.
user-invocable: true
disable-model-invocation: false
---

# claude-md-fix

Invoked as `/claude-md-fix "<what went wrong>"`.

The point is **not** to add a rule. It is to work out why the existing guidance
failed and put the fix at the layer that will hold. Most of the time the right
outcome is a rule moving *out* of CLAUDE.md, or a rule getting shorter.

## 1. Find the sentence

Quote the exact line in `CLAUDE.md` (or `.specify/memory/constitution.md`) that
permitted the error — or state plainly that no line covers it.

If you cannot find a sentence and the gap isn't real either, **stop**. Not every
mistake is a documentation bug; sometimes the guidance was right and was simply
not followed, which is case (D) below.

## 2. Classify

**(A) Hard rule, machine-checkable.** Add a check to `scripts/privacy-scan.js`
or an entry to `.gitignore`, then **delete the prose**. Never keep both — prose
kept "as a backstop" alongside a check teaches that unenforced prose is normal.
Add a unit test in `tests/unit/scripts/privacy-scan.test.js` for the new check.

**(B) Hard rule, not checkable.** Rewrite it: specific, and it must **name the
replacement action**, not only forbid. The model to match is "Use obvious
placeholders (`SYMBOL`, `123.45`, `BROKER`)" — it says what to do instead.
If this rule needs emphasis, something else must lose it (see the budget below).

**(C) Preference, not a rule.** Rewrite plainly or delete. Never emphasize.

**(D) Already stated correctly, and Claude ignored it.** Do **not** restate it
louder. Repetition and bold are what produced the 14-line privacy section that
failed anyway. Choose one of:
- move it earlier in the file (position beats volume),
- promote it to a hook check (case A),
- or accept it as unenforceable and delete it.

## 3. Check the constitution

Grep `.specify/memory/constitution.md` for the same rule. If it lives there:
- edit it **there**, with a version bump and a Sync Impact Report entry;
- leave at most a one-line imperative + `(canonical: constitution §N)` in CLAUDE.md.

The constitution supersedes CLAUDE.md on conflict (Governance), so a fix applied
only to CLAUDE.md is inert whenever the two disagree. Check for a contradiction
even when you are not editing the constitution.

CLAUDE.md never states a rationale. Rationale lives in exactly one place.

## 4. Budget check

CLAUDE.md has a soft cap of **80 lines** and **3 bold spans**. If the edit adds
more than 4 lines net, delete something else in the same edit. If it needs a
fourth bold span, one of the existing three isn't earning it — demote that one
first, and say which in your summary.

## 5. Log it

Append one row to `docs/claude-md-log.md`:

```
| date | what Claude did | the sentence that permitted it | class | where the fix landed |
```

The log lives outside CLAUDE.md and is never `@import`ed — it grows without
bound and would otherwise cost tokens in every session.

## The graduation rule

Before writing the row, grep the log for the same rule. **If this is its third
appearance, prose has failed and is not allowed a fourth try.** It must become a
hook check or a `.gitignore` entry, or be deleted as unenforceable. Say so
explicitly in your summary rather than filing another prose tweak.

## Finally

Report: the sentence, the classification, where the fix landed, what you deleted
to stay in budget, and — if applicable — that the graduation rule fired.
