import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@engine': fileURLToPath(new URL('./engine/src', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts'] },
});
