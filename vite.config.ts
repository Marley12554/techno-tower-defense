import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  resolve: { alias: { '@engine': fileURLToPath(new URL('./engine/src', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true },
});
