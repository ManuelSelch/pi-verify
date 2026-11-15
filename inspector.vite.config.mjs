import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist/inspector-ui',
    emptyOutDir: true,
    cssCodeSplit: false,
    // Mermaid's diagram renderers must stay inside the offline HTML bundle.
    rollupOptions: { output: { inlineDynamicImports: true } },
    lib: { entry: resolve('src/inspector/ui/index.ts'), formats: ['iife'], name: 'Inspector', fileName: () => 'app.js', cssFileName: 'app' },
  },
});
