import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  base: './',
  resolve: { alias: { '@engine': fileURLToPath(new URL('./engine/src', import.meta.url)) } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The design frames ship alongside the game so they can be viewed on a phone: /design/
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        design: fileURLToPath(new URL('./design/index.html', import.meta.url)),
        frames1: fileURLToPath(new URL('./design/frames/index.html', import.meta.url)),
        frames2: fileURLToPath(new URL('./design/frames/v2.html', import.meta.url)),
        frames3: fileURLToPath(new URL('./design/frames/v3-towers.html', import.meta.url)),
        lab: fileURLToPath(new URL('./design/lab.html', import.meta.url)),
      },
    },
  },
});
