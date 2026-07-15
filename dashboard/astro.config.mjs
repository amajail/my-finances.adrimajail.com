import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev-only shim so page scripts can `import charts from '../lib/charts.cjs'`.
 *
 * charts.cjs is CommonJS (kept that way so the pure helpers stay testable via
 * `require()` under jest). The production build already handles it via Vite's
 * Rollup commonjs plugin, but `astro dev` serves a source .cjs verbatim — no
 * ESM interop — so the default import resolves to `undefined` and the page
 * script crashes at load. This plugin (serve-only, so the build path is
 * untouched) wraps any self-contained source .cjs into an ESM module whose
 * default export is `module.exports`.
 */
function cjsSourceAsEsm() {
  return {
    name: 'cjs-source-as-esm',
    apply: 'serve',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('.cjs')) return null;
      return {
        code:
          'const module = { exports: {} };\nconst exports = module.exports;\n' +
          code +
          '\nexport default module.exports;\n',
        map: null,
      };
    },
  };
}

export default defineConfig({
  output: 'static',
  vite: {
    plugins: [cjsSourceAsEsm(), tailwindcss()],
  },
});
