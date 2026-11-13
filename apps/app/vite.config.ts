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
  // Bundled three.js, React etc. keep their license notices in THIRD_PARTY_LICENSES.md next to the app
  build: { outDir: 'dist', emptyOutDir: true, license: { fileName: 'THIRD_PARTY_LICENSES.md' } },
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
