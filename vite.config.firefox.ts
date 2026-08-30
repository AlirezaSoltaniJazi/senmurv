import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Separate pipeline from vite.config.ts — @crxjs/vite-plugin has no Firefox
// support, and vite-plugin-web-extension's background-script build breaks
// under this project's Vite 8 (Rolldown-engine) setup: it requests an IIFE
// format together with code-splitting, which Rolldown rejects outright, and
// separately ignores the configured outDir. So this is a hand-rolled build
// with plain rollupOptions instead — no extension-specific plugin — driven
// by scripts/build-firefox.mjs, which also writes dist-firefox/manifest.json
// (rewriting manifest.firefox.json's source-file paths to the built output
// paths below) and copies src/content/picker-loader.js in verbatim.
//
// background.js and picker.js get stable, unhashed names because they're
// referenced by filename from manifest.firefox.json and picker-loader.js
// respectively. picker.js is real ESM (unlike the classic-script loader that
// dynamically imports it) — see picker-loader.js for why that split exists —
// so its own relative `import('./tools')` code-splits normally under 'es'
// output, the same way CRXJS's Chrome bundle does.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-firefox',
    // false — scripts/build-firefox.mjs owns clearing dist-firefox/ (it also
    // writes manifest.json and picker-loader.js into the same directory) and
    // must be able to write into it before AND after this build runs.
    emptyOutDir: false,
    sourcemap: true,
    // MUST stay off — same reason as vite.config.ts: Vite's preload helper
    // injects a <link rel="modulepreload"> into the HOST page's document
    // when the picker's lazy `import('./tools')` chunk first loads.
    modulePreload: false,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, 'src/background/service-worker.ts'),
        picker: path.resolve(__dirname, 'src/content/picker.ts'),
        sidepanel: path.resolve(__dirname, 'src/sidepanel/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'picker') return 'picker.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
