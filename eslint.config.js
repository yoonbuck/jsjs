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
    // harness globals and deliberately contain invalid syntax.
    ignores: ['**/node_modules/**', 'test/fixtures/**'],
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
];
