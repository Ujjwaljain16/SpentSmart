import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each test starts a fresh in-process Postgres; under a full parallel run that can take longer than the 10 s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
