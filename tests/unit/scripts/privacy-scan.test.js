// privacy-scan: allow-secrets
// This file necessarily contains credential-SHAPED strings to test the detector.
// Every one below is fabricated. Do not paste a real key here — the pragma above
// switches the credential check off for this file only.

const {
  classifyCommand,
  scanLines,
  splitSegments,
  isPrivatePath,
  isSafeToStage,
  isFixturePath,
} = require('../../../scripts/privacy-scan');

describe('privacy-scan / splitSegments', () => {
  it('splits on shell operators', () => {
    expect(splitSegments('ls && git add a ; echo hi')).toEqual(['ls', 'git add a', 'echo hi']);
  });

  it('does not split inside quotes', () => {
    expect(splitSegments('git commit -m "fix; and && stuff"')).toEqual(['git commit -m "fix; and && stuff"']);
  });
});

describe('privacy-scan / classifyCommand', () => {
  it('ignores commands with no git invocation', () => {
    expect(classifyCommand('npm test')).toEqual([]);
    expect(classifyCommand('')).toEqual([]);
    expect(classifyCommand(undefined)).toEqual([]);
  });

  it('finds git after a quoted cd — the case an anchored regex would miss', () => {
    const [inv] = classifyCommand('cd "/tmp/a b" && git add secret.json');
    expect(inv.verb).toBe('add');
    expect(inv.pathspecs).toEqual(['secret.json']);
  });

  it('detects force-add in long, short and bundled forms', () => {
    expect(classifyCommand('git add -f x')[0].force).toBe(true);
    expect(classifyCommand('git add --force x')[0].force).toBe(true);
    expect(classifyCommand('git add -fA')[0].force).toBe(true);
  });

  it('does not treat push --force as an add-force', () => {
    const [inv] = classifyCommand('git push --force');
    expect(inv.verb).toBe('push');
    expect(inv.force).toBe(false);
  });

  it('detects broad adds', () => {
    expect(classifyCommand('git add -A')[0].broad).toBe(true);
    expect(classifyCommand('git add .')[0].broad).toBe(true);
    expect(classifyCommand('git add :/')[0].broad).toBe(true);
    expect(classifyCommand('git add --all')[0].broad).toBe(true);
  });

  it('does not flag a targeted add as broad', () => {
    const [inv] = classifyCommand('git add src/index.js CLAUDE.md');
    expect(inv.broad).toBe(false);
    expect(inv.pathspecs).toEqual(['src/index.js', 'CLAUDE.md']);
  });

  it('skips git global flags to reach the subcommand', () => {
    const [inv] = classifyCommand('git -C /repo add -f x');
    expect(inv.verb).toBe('add');
    expect(inv.force).toBe(true);
  });

  it('collects pathspecs after a double dash', () => {
    const [inv] = classifyCommand('git add -- scripts/positions.json');
    expect(inv.pathspecs).toEqual(['scripts/positions.json']);
  });

  it('extracts commit messages and unquotes them', () => {
    const [inv] = classifyCommand('git commit -m "fix: thing"');
    expect(inv.messages).toEqual(['fix: thing']);
    expect(inv.deferMessage).toBe(false);
  });

  it('defers when the message comes from a file or an editor', () => {
    expect(classifyCommand('git commit -F msg.txt')[0].deferMessage).toBe(true);
    expect(classifyCommand('git commit')[0].deferMessage).toBe(true);
  });

  it('finds every git invocation in a chain', () => {
    const invs = classifyCommand('git add . && git commit -m "x" && git push');
    expect(invs.map((i) => i.verb)).toEqual(['add', 'commit', 'push']);
  });
});

describe('privacy-scan / isPrivatePath', () => {
  it.each([
    'scripts/positions.json',
    'scripts/update-bullmarket-2026-05-11.js',
    'scripts/plan-version.local.json',
    'docs/private/portfolio-framework-v3.md',
    'local.settings.json',
    '.env',
    '.env.local',
    'portfolio-report.html',
    'metaprompt-rebalance-plan.md',
    '.claude/settings.local.json',
  ])('protects %s', (p) => {
    expect(isPrivatePath(p)).toBe(true);
  });

  it.each([
    'src/domain/entities/Position.js',
    'scripts/positions.template.json',
    'scripts/seed-positions.js',
    'docs/research/README.md',
    'CLAUDE.md',
    '.env.test',
    'dashboard/.env.production',
  ])('allows %s', (p) => {
    expect(isPrivatePath(p)).toBe(false);
  });
});

describe('privacy-scan / isSafeToStage', () => {
  it('accepts ordinary work areas and known root config', () => {
    expect(isSafeToStage('src/functions/x.js')).toBe(true);
    expect(isSafeToStage('specs/020-thing/plan.md')).toBe(true);
    expect(isSafeToStage('package.json')).toBe(true);
    expect(isSafeToStage('.claude/settings.json')).toBe(true);
  });

  it('rejects protected paths and unrecognised strays', () => {
    expect(isSafeToStage('scripts/positions.json')).toBe(false);
    expect(isSafeToStage('my-holdings-export.csv')).toBe(false);
    expect(isSafeToStage('docs/private/x.md')).toBe(false);
  });
});

describe('privacy-scan / isFixturePath', () => {
  it('recognises places where fake numbers belong', () => {
    expect(isFixturePath('tests/unit/domain/Position.test.js')).toBe(true);
    expect(isFixturePath('scripts/positions.template.json')).toBe(true);
    expect(isFixturePath('scripts/allocation-targets.example.json')).toBe(true);
    expect(isFixturePath('src/domain/entities/Position.js')).toBe(false);
  });
});

describe('privacy-scan / scanLines — secrets', () => {
  it.each([
    ['AccountKey=abcdefghijklmnopqrstuvwx123456==', 'Azure Storage AccountKey'],
    ['DefaultEndpointsProtocol=https;AccountName=x', 'Azure Storage connection string'],
    ['const k = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"', 'Anthropic API key'],
    ['token: ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'GitHub personal access token'],
    ['"connectionString": "UseDevelopmentStorage=true;Extra=padding"', 'connectionString literal'],
  ])('flags %s', (text, label) => {
    const { secrets } = scanLines([{ path: 'src/x.js', text }]);
    expect(secrets).toHaveLength(1);
    expect(secrets[0].label).toBe(label);
  });

  it('honours the allow-secrets pragma for the given file only', () => {
    const lines = [
      { path: 'tests/unit/scripts/privacy-scan.test.js', text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
      { path: 'src/config.js', text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
    ];
    const allowsSecrets = (p) => p === 'tests/unit/scripts/privacy-scan.test.js';
    const { secrets } = scanLines(lines, { allowsSecrets });
    expect(secrets).toEqual([{ path: 'src/config.js', label: 'GitHub personal access token' }]);
  });

  it('scans everything when no pragma checker is supplied', () => {
    const { secrets } = scanLines([{ path: 'anything.js', text: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }]);
    expect(secrets).toHaveLength(1);
  });

  it('does not flag ordinary code', () => {
    const { secrets } = scanLines([
      { path: 'src/x.js', text: 'const total = quantity * averageCost;' },
      { path: 'src/x.js', text: "rowKey: `${assetType}__${symbol}`" },
      { path: 'src/x.js', text: 'const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;' },
    ]);
    expect(secrets).toEqual([]);
  });
});

describe('privacy-scan / scanLines — symbols', () => {
  const symbols = ['GOOGL', 'GD35'];

  it('flags a real ticker paired with a number outside fixtures', () => {
    const { symbols: hits } = scanLines([{ path: 'scripts/x.js', text: 'GOOGL quantity 41 at 178.25' }], { symbols });
    expect(hits).toEqual([{ path: 'scripts/x.js', symbol: 'GOOGL' }]);
  });

  it('ignores fixtures and examples', () => {
    const lines = [
      { path: 'tests/unit/x.test.js', text: 'GOOGL 41 178.25' },
      { path: 'scripts/positions.template.json', text: 'GD35 100 55.10' },
    ];
    expect(scanLines(lines, { symbols }).symbols).toEqual([]);
  });

  it('ignores a ticker with no number beside it', () => {
    expect(scanLines([{ path: 'docs/x.md', text: 'GOOGL is a CEDEAR' }], { symbols }).symbols).toEqual([]);
  });

  it('is inert when no symbol list is configured', () => {
    expect(scanLines([{ path: 'scripts/x.js', text: 'GOOGL 41 178.25' }]).symbols).toEqual([]);
  });

  it('does not match a ticker embedded in a longer word', () => {
    expect(scanLines([{ path: 'scripts/x.js', text: 'GOOGLE 41 178.25' }], { symbols }).symbols).toEqual([]);
  });
});

describe('privacy-scan / commit -a', () => {
  it('flags that -a stages tracked edits not yet in the index', () => {
    expect(classifyCommand('git commit -a -m "x"')[0].stagesTracked).toBe(true);
    expect(classifyCommand('git commit --all -m "x"')[0].stagesTracked).toBe(true);
    expect(classifyCommand('git commit -am "x"')[0].stagesTracked).toBe(true);
    expect(classifyCommand('git commit -am "x"')[0].messages).toEqual(['x']);
  });

  it('leaves a plain commit reading the index', () => {
    expect(classifyCommand('git commit -m "x"')[0].stagesTracked).toBe(false);
  });
});
