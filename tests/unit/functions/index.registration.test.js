/**
 * Guard: every HTTP/timer function file must be registered in
 * src/functions/index.js (the Functions host entry point loads only what this
 * index requires — a missing require means a 404 in production).
 */

const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '../../../src/functions');
// Files that are NOT standalone function registrations.
const EXCLUDE = new Set(['index.js', '_shared.js']);

describe('src/functions/index.js registration', () => {
  it('requires every function module', () => {
    const indexSrc = fs.readFileSync(path.join(FUNCTIONS_DIR, 'index.js'), 'utf8');
    const files = fs.readdirSync(FUNCTIONS_DIR)
      .filter((f) => f.endsWith('.js') && !EXCLUDE.has(f));

    const missing = files.filter((f) => {
      const mod = `./${f.replace(/\.js$/, '')}`;
      return !indexSrc.includes(`require('${mod}')`) && !indexSrc.includes(`require("${mod}")`);
    });

    expect(missing).toEqual([]);
  });
});
