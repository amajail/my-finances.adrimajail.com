#!/usr/bin/env node
/**
 * privacy-scan — the machine-checkable half of CLAUDE.md's privacy rules.
 *
 * One scanner, three consumers:
 *   --hook            stdin is a Claude Code PreToolUse payload (see scripts/hooks/git-guard.sh)
 *   --staged          scan the index (for a local pre-commit hook)
 *   --range A...B     scan a commit range (CI)
 *
 * Checks are bound to the git verb they can actually see. PreToolUse fires
 * BEFORE the command runs, so at `git add` time nothing is staged yet and
 * `git diff --cached` reads stale state — path checks go on `add`, content
 * checks go on `commit`/`push`.
 *
 * Zero dependencies on purpose: the CI job runs it without `npm ci`.
 */

'use strict';

const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Paths that must never be staged. Deterministic — safe to deny outright. */
const PRIVATE_PATHS = [
  /(^|\/)positions\.json$/,
  /(^|\/)scripts\/[^/]*\.local\.[A-Za-z0-9]+$/,
  /(^|\/)scripts\/update-[^/]*$/,
  /(^|\/)docs\/private\//,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)local\.settings\.json$/,
  /(^|\/)portfolio-report\.html$/,
  /(^|\/)plan-rebalanceo-brokers\.html$/,
  /(^|\/)metaprompt-rebalance-plan\.md$/,
  /(^|\/)analysis-framework\.local\.md$/,
  /(^|\/)\.playwright-mcp\//,
  /(^|\/)\.claude\/settings\.local\.json$/,
  /(^|\/)\.claude\/private-symbols\.txt$/,
  /(^|\/)CLAUDE\.local\.md$/,
];

/** `.env.test` holds Azurite placeholders and is committed on purpose. */
const PRIVATE_PATH_EXCEPTIONS = [/(^|\/)\.env\.test$/, /(^|\/)dashboard\/\.env\.production$/];

/** High-precision credential shapes. Near-zero false positives — these deny. */
const SECRET_PATTERNS = [
  [/AccountKey\s*=\s*[A-Za-z0-9+/=]{16,}/, 'Azure Storage AccountKey'],
  [/DefaultEndpointsProtocol\s*=\s*https?\s*;/i, 'Azure Storage connection string'],
  [/SharedAccessSignature\s*=/i, 'Azure SAS token'],
  [/sk-ant-api\d\d-[A-Za-z0-9\-_]{20,}/, 'Anthropic API key'],
  [/ghp_[A-Za-z0-9]{36}/, 'GitHub personal access token'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'GitHub fine-grained PAT'],
  [/AZURE_STORAGE_CONNECTION_STRING\s*=\s*\S+/, 'Azure storage connection string'],
  [/"connectionString"\s*:\s*"[^"]{20,}"/, 'connectionString literal'],
  [/x-functions-key\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{20,}/i, 'Azure Function App key'],
];

/** Where ordinary work lives. Anything else in a broad `git add` prompts the owner. */
const SAFE_PREFIXES = [
  'src/',
  'tests/',
  'dashboard/',
  'specs/',
  '.github/',
  '.specify/',
  'docs/',
  '.claude/hooks/',
  '.claude/skills/',
  'scripts/',
];

const SAFE_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.gitignore',
  '.prettierignore',
  '.prettierrc',
  '.funcignore',
  'eslint.config.js',
  'jest.config.js',
  'host.json',
  'README.md',
  'CLAUDE.md',
  '.env.test',
  '.claude/settings.json',
]);

/**
 * A file may opt out of the credential check by containing this marker. It is
 * deliberately not a blanket `tests/**` exemption: a real key pasted into a
 * test file is still a leak. Opting out has to be a visible, greppable act —
 * `grep -rn 'privacy-scan: allow-secrets'` lists every exemption in the repo.
 */
const ALLOW_SECRETS_PRAGMA = /privacy-scan:\s*allow-secrets/;

/** Diff paths where fake numbers are the whole point. */
const FIXTURE_PATHS = [
  /(^|\/)tests?\//,
  /\.test\.[jt]s$/,
  /\.spec\.[jt]s$/,
  /\.template\.[A-Za-z0-9]+$/,
  /\.example\.[A-Za-z0-9]+$/,
];

const FIX_HINT = 'If this block is wrong, run /claude-md-fix so the rule gets fixed, not worked around.';

// ---------------------------------------------------------------------------
// Command parsing
// ---------------------------------------------------------------------------

/**
 * Split a shell command into segments on `&&`, `||`, `;`, `|`, and newlines,
 * respecting single and double quotes. Good enough to find git invocations;
 * it is not a shell.
 */
function splitSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        current += ch + command[++i];
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(current);
      current = '';
      i++;
      continue;
    }
    // `(`/`)`/`{`/`}` are separators too, so a subshell like `(git add -f x)`
    // does not hide the invocation behind a `(git` token.
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '(' || ch === ')' || ch === '{' || ch === '}') {
      segments.push(current);
      current = '';
      continue;
    }

    current += ch;
  }
  segments.push(current);

  return segments.map((s) => s.trim()).filter(Boolean);
}

/** Tokenize one segment, stripping one level of quoting. */
function tokenize(segment) {
  const tokens = [];
  let current = '';
  let quote = null;
  let started = false;

  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];

    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < segment.length) {
        current += segment[++i];
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current || started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }

    current += ch;
  }
  if (current || started) tokens.push(current);

  return tokens;
}

/** Global git flags that consume the following token. */
const GIT_FLAGS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * Find every git invocation in a command and describe it.
 *
 * @returns {Array<{verb: string, args: string[], force: boolean, broad: boolean,
 *                  pathspecs: string[], messages: string[], deferMessage: boolean}>}
 */
function classifyCommand(command) {
  if (typeof command !== 'string' || !command.trim()) return [];

  const invocations = [];

  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);

    let i = 0;
    // Skip leading env assignments (FOO=bar git ...).
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;

    const cmd = tokens[i];
    if (!cmd || !/(^|\/)git$/.test(cmd)) continue;
    i++;

    // Skip git's own global flags to reach the subcommand.
    while (i < tokens.length && tokens[i].startsWith('-')) {
      if (GIT_FLAGS_WITH_VALUE.has(tokens[i]) && !tokens[i].includes('=')) i++;
      i++;
    }

    const verb = tokens[i];
    if (!verb) continue;
    const args = tokens.slice(i + 1);

    invocations.push(describe(verb, args));
  }

  return invocations;
}

function describe(verb, args) {
  const inv = {
    verb,
    args,
    force: false,
    broad: false,
    pathspecs: [],
    messages: [],
    deferMessage: false,
    stagesTracked: false,
  };

  let afterDoubleDash = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (afterDoubleDash) {
      inv.pathspecs.push(arg);
      continue;
    }
    if (arg === '--') {
      afterDoubleDash = true;
      continue;
    }

    if (arg.startsWith('-')) {
      if (verb === 'add' && (arg === '-f' || arg === '--force')) inv.force = true;
      if (verb === 'add' && (arg === '-A' || arg === '--all' || arg === '-u' || arg === '--update')) {
        inv.broad = true;
      }
      // Bundled short flags: -fA, -Af, -nf …
      if (verb === 'add' && /^-[A-Za-z]{2,}$/.test(arg)) {
        if (arg.includes('f')) inv.force = true;
        if (arg.includes('A') || arg.includes('u')) inv.broad = true;
      }

      if (verb === 'commit') {
        // `-a` stages tracked modifications as part of the commit, so at hook
        // time the index does NOT yet contain them. A tracked file edited after
        // its last clean `git add` never passed an add-time gate, so this is a
        // real path for a secret to reach a commit — scan the worktree instead.
        if (arg === '-a' || arg === '--all') inv.stagesTracked = true;
        if (/^-[A-Za-z]{2,}$/.test(arg) && arg.includes('a')) inv.stagesTracked = true;

        if (arg === '-m' || arg === '--message') {
          if (args[i + 1] !== undefined) inv.messages.push(args[++i]);
        } else if (arg.startsWith('--message=')) {
          inv.messages.push(arg.slice('--message='.length));
        } else if (arg === '-F' || arg === '--file' || arg.startsWith('--file=')) {
          // Message comes from a file we cannot see — skip the message check.
          inv.deferMessage = true;
        } else if (/^-[A-Za-z]{2,}$/.test(arg) && arg.includes('m')) {
          if (args[i + 1] !== undefined) inv.messages.push(args[++i]);
        }
      }
      continue;
    }

    inv.pathspecs.push(arg);
  }

  if (verb === 'add') {
    // `.`, `:/`, `*` stage far more than they name.
    if (inv.pathspecs.some((p) => p === '.' || p === ':/' || p === '*' || p === './' || p === ':/*')) {
      inv.broad = true;
    }
    // Bare `git add` with no pathspec is a no-op, not a risk.
    if (inv.pathspecs.length === 0 && !inv.broad) inv.broad = false;
  }

  if (verb === 'commit' && inv.messages.length === 0 && !inv.deferMessage) {
    // Editor-based commit — message not visible at hook time.
    inv.deferMessage = true;
  }

  return inv;
}

// ---------------------------------------------------------------------------
// Content scanning
// ---------------------------------------------------------------------------

function isPrivatePath(p) {
  const norm = String(p).replace(/^\.\//, '');
  if (PRIVATE_PATH_EXCEPTIONS.some((re) => re.test(norm))) return false;
  return PRIVATE_PATHS.some((re) => re.test(norm));
}

function isFixturePath(p) {
  return FIXTURE_PATHS.some((re) => re.test(String(p)));
}

function isSafeToStage(p) {
  const norm = String(p).replace(/^\.\//, '');
  if (isPrivatePath(norm)) return false;
  if (SAFE_ROOT_FILES.has(norm)) return true;
  return SAFE_PREFIXES.some((prefix) => norm.startsWith(prefix));
}

/**
 * Scan added diff lines for secrets, and optionally for owner symbols.
 *
 * @param {Array<{path: string, text: string}>} lines
 * @param {{symbols?: string[], allowsSecrets?: (path: string) => boolean}} [opts]
 * @returns {{secrets: object[], symbols: object[]}}
 */
function scanLines(lines, opts = {}) {
  const secrets = [];
  const symbols = [];
  const symbolList = (opts.symbols || []).filter(Boolean);
  const allowsSecrets = opts.allowsSecrets || (() => false);

  for (const { path, text } of lines) {
    if (!allowsSecrets(path)) {
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(text)) {
          secrets.push({ path, label });
          break;
        }
      }
    }

    if (symbolList.length && !isFixturePath(path) && /\d[\d.,]{2,}/.test(text)) {
      const hit = symbolList.find((sym) => new RegExp(`\\b${escapeRegExp(sym)}\\b`).test(text));
      if (hit) symbols.push({ path, symbol: hit });
    }
  }

  return { secrets, symbols };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// git helpers (all failures are non-fatal — the caller decides)
// ---------------------------------------------------------------------------

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Files a broad `git add` would newly stage. */
function wouldStage(cwd) {
  const out = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd);
  const entries = out.split('\0').filter(Boolean);
  const paths = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    const index = entry[0];
    const worktree = entry[1];
    const path = entry.slice(3);

    // Renames carry a second \0-separated source path — consume it.
    if (index === 'R' || index === 'C') i++;

    if (index === '?' || worktree !== ' ') paths.push(path);
  }

  return paths;
}

/** Added lines from a diff, tagged with their file. */
function addedLines(diffArgs, cwd) {
  const out = git(['diff', '--unified=0', '--no-color', ...diffArgs], cwd);
  const lines = [];
  let path = '(unknown)';

  for (const line of out.split('\n')) {
    if (line.startsWith('+++ b/')) {
      path = line.slice('+++ b/'.length);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push({ path, text: line.slice(1) });
    }
  }

  return lines;
}

function changedPaths(diffArgs, cwd) {
  return git(['diff', '--name-only', ...diffArgs], cwd).split('\n').filter(Boolean);
}

/**
 * Does this file carry the allow-secrets pragma? Reads the working tree, which
 * is present in all three modes (CI checks out the head of the range). An
 * unreadable file means no exemption — fail toward scanning.
 */
function makePragmaChecker(cwd) {
  const fs = require('fs');
  const path = require('path');
  const cache = new Map();

  return (p) => {
    if (cache.has(p)) return cache.get(p);
    let allowed = false;
    try {
      allowed = ALLOW_SECRETS_PRAGMA.test(fs.readFileSync(path.join(cwd, p), 'utf8'));
    } catch {
      allowed = false;
    }
    cache.set(p, allowed);
    return allowed;
  };
}

/**
 * The owner's ticker list, if present. Deliberately gitignored: a committed
 * list of real symbols is itself a holdings disclosure. Consequence — CI can
 * never run this check.
 */
function loadSymbols(cwd) {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(cwd, '.claude', 'private-symbols.txt');
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hook mode
// ---------------------------------------------------------------------------

function emit(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

/** No opinion — let the normal permission flow decide. */
function passThrough() {
  process.exit(0);
}

function runHook(payload) {
  const command = payload && payload.tool_input && payload.tool_input.command;
  const cwd = (payload && payload.cwd) || process.cwd();
  const invocations = classifyCommand(command);
  if (!invocations.length) passThrough();

  const allowsSecrets = makePragmaChecker(cwd);

  const asks = [];

  for (const inv of invocations) {
    if (inv.verb === 'add') {
      // FORCE_ADD — .gitignore is the privacy boundary; -f exists only to cross it.
      if (inv.force) {
        emit(
          'deny',
          '`git add -f` bypasses .gitignore, which is this repo\'s privacy boundary ' +
            '(real holdings, credentials, and owner-private docs are protected by it).\n' +
            'If the file is genuinely safe to publish, add a negation to .gitignore in its own commit, ' +
            'then stage it normally.\n' +
            FIX_HINT
        );
      }

      // PRIVATE_PATH — named a protected file outright.
      const named = inv.pathspecs.filter(isPrivatePath);
      if (named.length) {
        emit(
          'deny',
          `These paths hold real portfolio data or credentials and must not be staged:\n` +
            named.map((p) => `  - ${p}`).join('\n') +
            `\nThey are already covered by .gitignore. Use placeholder values (SYMBOL, 123.45, BROKER) ` +
            `in anything committed.\n` +
            FIX_HINT
        );
      }

      // BROAD_ADD — heuristic, so ask rather than deny.
      if (inv.broad) {
        let staging;
        try {
          staging = wouldStage(cwd);
        } catch {
          continue; // git unavailable — fail open
        }
        const priv = staging.filter(isPrivatePath);
        const unknown = staging.filter((p) => !isPrivatePath(p) && !isSafeToStage(p));

        if (priv.length) {
          emit(
            'deny',
            `A broad \`git add\` here would stage protected files:\n` +
              priv.map((p) => `  - ${p}`).join('\n') +
              `\nStage explicit paths instead: git add <path>.\n` +
              FIX_HINT
          );
        }
        if (unknown.length) {
          asks.push(
            `\`${inv.verb} ${inv.args.join(' ')}\` would stage files outside the usual work areas:\n` +
              unknown.slice(0, 15).map((p) => `  - ${p}`).join('\n') +
              (unknown.length > 15 ? `\n  … and ${unknown.length - 15} more` : '') +
              `\nConfirm none of them contain real quantities, PPC/averageCost, prices, or account identifiers.`
          );
        }
      }
    }

    if (inv.verb === 'commit') {
      // `-a` will stage tracked edits that are not in the index yet, so
      // `--cached` would read an empty diff and silently find nothing.
      const base = inv.stagesTracked ? ['HEAD'] : ['--cached'];
      let lines = [];
      try {
        lines = addedLines(base, cwd);
      } catch {
        continue; // fail open
      }

      const symbols = loadSymbols(cwd);
      const { secrets, symbols: symbolHits } = scanLines(lines, { symbols, allowsSecrets });

      if (secrets.length) {
        emit(
          'deny',
          `The staged changes contain what looks like a credential:\n` +
            dedupe(secrets.map((s) => `  - ${s.label} in ${s.path}`)).join('\n') +
            `\nRemove it and use an env var or local.settings.json (both gitignored).\n` +
            FIX_HINT
        );
      }

      // The commit message is un-rewritable once pushed.
      if (!inv.deferMessage && inv.messages.length) {
        const msgLines = inv.messages.map((m) => ({ path: '(commit message)', text: m }));
        const msg = scanLines(msgLines, { symbols });  // messages have no file to carry a pragma
        if (msg.secrets.length) {
          emit(
            'deny',
            `The commit message contains what looks like a credential ` +
              `(${msg.secrets[0].label}). Commit messages cannot be rewritten after pushing.\n` +
              FIX_HINT
          );
        }
        if (msg.symbols.length) {
          asks.push(
            `The commit message mentions ${msg.symbols[0].symbol} alongside a number. ` +
              `Commit messages cannot be rewritten after pushing — confirm it holds no real holdings data.`
          );
        }
      }

      if (symbolHits.length) {
        asks.push(
          `Staged changes pair a real ticker with a number:\n` +
            dedupe(symbolHits.map((h) => `  - ${h.symbol} in ${h.path}`)).join('\n') +
            `\nConfirm these are placeholders, not real holdings.`
        );
      }
    }

    if (inv.verb === 'push') {
      let range;
      try {
        git(['rev-parse', '--abbrev-ref', '@{u}'], cwd);
        range = '@{u}..HEAD';
      } catch {
        range = 'origin/main..HEAD';
      }

      let paths = [];
      let lines = [];
      try {
        paths = changedPaths([range], cwd);
        lines = addedLines([range], cwd);
      } catch {
        continue; // fail open
      }

      const priv = paths.filter(isPrivatePath);
      if (priv.length) {
        emit(
          'deny',
          `This push contains commits touching protected paths:\n` +
            priv.map((p) => `  - ${p}`).join('\n') +
            `\nPushing publishes them irreversibly. Rewrite the history first.\n` +
            FIX_HINT
        );
      }

      const { secrets } = scanLines(lines, { allowsSecrets });
      if (secrets.length) {
        emit(
          'deny',
          `This push contains what looks like a credential:\n` +
            dedupe(secrets.map((s) => `  - ${s.label} in ${s.path}`)).join('\n') +
            `\nRotate it and rewrite the history before pushing.\n` +
            FIX_HINT
        );
      }
    }
  }

  if (asks.length) emit('ask', asks.join('\n\n'));
  passThrough();
}

function dedupe(arr) {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// CI / pre-commit mode (fail-closed: non-zero exit on findings)
// ---------------------------------------------------------------------------

function runScan(diffArgs, cwd) {
  const paths = changedPaths(diffArgs, cwd);
  const lines = addedLines(diffArgs, cwd);
  const { secrets } = scanLines(lines, { symbols: loadSymbols(cwd), allowsSecrets: makePragmaChecker(cwd) });

  const problems = [];

  const priv = paths.filter(isPrivatePath);
  if (priv.length) {
    problems.push('Protected paths present in this change:\n' + priv.map((p) => `  - ${p}`).join('\n'));
  }
  if (secrets.length) {
    problems.push(
      'Possible credentials in added lines:\n' + dedupe(secrets.map((s) => `  - ${s.label} in ${s.path}`)).join('\n')
    );
  }

  if (problems.length) {
    process.stderr.write('privacy-scan FAILED\n\n' + problems.join('\n\n') + '\n');
    process.exit(1);
  }

  process.stdout.write(`privacy-scan OK — ${paths.length} file(s), ${lines.length} added line(s) checked\n`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readStdin() {
  const fs = require('fs');
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv) {
  const cwd = process.cwd();

  if (argv.includes('--hook')) {
    // Every failure path here exits non-zero WITHOUT emitting a decision: a
    // non-zero exit is a non-blocking error, so the tool proceeds (fail-open).
    // One terse line, never a stack trace — this lands in the user's session.
    try {
      runHook(JSON.parse(readStdin()));
    } catch (err) {
      process.stderr.write(`privacy-scan: skipped (${err.message})\n`);
      process.exit(1);
    }
    return;
  }

  if (argv.includes('--staged')) {
    runScan(['--cached'], cwd);
    return;
  }

  const rangeIdx = argv.indexOf('--range');
  if (rangeIdx !== -1 && argv[rangeIdx + 1]) {
    runScan([argv[rangeIdx + 1]], cwd);
    return;
  }

  process.stderr.write('usage: privacy-scan.js (--hook | --staged | --range <A...B>)\n');
  process.exit(2);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  classifyCommand,
  scanLines,
  splitSegments,
  tokenize,
  isPrivatePath,
  isSafeToStage,
  isFixturePath,
};
