import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'web',
  // GitHub Pages serves the demo below /<repo>/
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // Use the library source directly so changes show up without a build step
  resolve: { alias: { infra3d: src('../../packages/infra3d/src/index.ts') } },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
