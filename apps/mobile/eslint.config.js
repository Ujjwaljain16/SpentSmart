// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Logging goes through lib/logger (redacts UPI IDs and amounts).
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/exhaustive-deps': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
]);
