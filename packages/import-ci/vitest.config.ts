import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against the library source so the tests do not need a prior build of infra3d
export default defineConfig({
  resolve: { alias: { 'infra3d/core': fileURLToPath(new URL('../infra3d/src/core.ts', import.meta.url)) } },
});
