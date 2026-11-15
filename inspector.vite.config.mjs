import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist/inspector-ui',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: resolve('src/inspector/ui/index.ts'), formats: ['iife'], name: 'Inspector', fileName: () => 'app.js', cssFileName: 'app' },
  },
});
