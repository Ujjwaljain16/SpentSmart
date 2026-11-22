import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd()) },
  },
  test: {
    environment: 'node',
    // The two-phone sync tests start an in-process API and Postgres per test, which can pass 10 s under load.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts', 'db/**/*.test.ts', 'lib/**/*.test.ts', 'services/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['db/**', 'lib/**', 'services/**'],
      exclude: ['**/*.test.ts', 'db/expo-driver.ts', 'db/client.ts'],
    },
  },
});
