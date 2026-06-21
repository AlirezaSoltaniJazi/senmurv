import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const isLocal = mode === 'unpacked';
  const activeManifest = isLocal
    ? {
        ...manifest,
        name: `${manifest.name} - Local`,
        action: {
          ...manifest.action,
          default_title: `${manifest.action.default_title} (Local)`,
        },
      }
    : manifest;

  return {
    plugins: [react(), crx({ manifest: activeManifest })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Sourcemaps only for the local/unpacked build — keeps the production
      // CWS zip small (~80% of the bundle is .map files otherwise) and avoids
      // shipping source structure to end users.
      sourcemap: isLocal,
      // CRXJS discovers all entry points from manifest.json (service_worker,
      // content_scripts, and the side_panel.default_path HTML), so no explicit
      // rollupOptions.input is needed.
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5174,
      },
    },
  };
});
