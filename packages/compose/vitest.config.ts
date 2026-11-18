import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against the library source so the tests do not need a prior build of stratoscope-infra
export default defineConfig({
  resolve: { alias: { 'stratoscope-infra/core': fileURLToPath(new URL('../infra/src/core.ts', import.meta.url)) } },
});
