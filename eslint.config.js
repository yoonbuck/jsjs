const globals = {
  console: 'readonly',
  document: 'readonly',
  location: 'readonly',
  process: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
};

export default [
  {
    // Test262 fixtures are guest scripts, not host modules: they reference
    // harness globals and deliberately contain invalid syntax. `vendor/` is a
    // generated copy of pinned dependencies, not project source.
    ignores: ['**/node_modules/**', 'vendor/**', 'test/fixtures/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The Unicode data generator downloads the pinned UCD files. It is a
    // build-time tool, never part of the engine, so `fetch` is allowed here
    // and nowhere else.
    files: ['tools/unicode/*.js'],
    languageOptions: {
      globals: { ...globals, fetch: 'readonly' },
    },
  },
  {
    // Issue #40 evaluation prototypes: isolated benchmarks, never part of the
    // engine. They time with the cross-host `performance` clock (available in
    // Node, browsers, and JavaScriptCore), and the allocation bench yields
    // through `setTimeout` so asynchronously-delivered GC `PerformanceObserver`
    // callbacks arrive before a sample is judged. Both are allowed here and
    // nowhere else.
    files: ['tools/prototypes/*.js'],
    languageOptions: {
      globals: {
        ...globals,
        performance: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
];
