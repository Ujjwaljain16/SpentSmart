import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd()) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'domain/**/*.test.ts', 'db/**/*.test.ts', 'lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['domain/**', 'db/**', 'lib/**'],
      exclude: ['**/*.test.ts', 'db/expo-driver.ts', 'db/client.ts'],
    },
  },
});
