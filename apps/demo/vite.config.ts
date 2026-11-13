import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the demo below /<repo>/
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // Use the library source directly so changes show up without a build step
  resolve: { alias: { infra3d: fileURLToPath(new URL('../../packages/infra3d/src/index.ts', import.meta.url)) } },
});
