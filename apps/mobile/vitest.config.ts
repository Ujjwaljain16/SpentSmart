import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd()) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'db/**/*.test.ts', 'lib/**/*.test.ts', 'services/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['db/**', 'lib/**', 'services/**'],
      exclude: ['**/*.test.ts', 'db/expo-driver.ts', 'db/client.ts'],
    },
  },
});
