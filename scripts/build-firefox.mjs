#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'dist-firefox');
const watch = process.argv.includes('--watch');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// vite.config.firefox.ts (emptyOutDir: false — this script owns dist-firefox/
// as a whole) builds background.js and picker.js from their source .ts
// paths, so the manifest that ships in dist-firefox/ needs to reference the
// built filenames instead. manifest.firefox.json itself stays
// source-referencing, matching manifest.json's convention for the Chrome
// build. sidebar_action.default_panel is untouched: the HTML entry's output
// path mirrors its source path (src/sidepanel/index.html), same as Chrome's.
//
// Icon paths need the "public/" prefix stripped: Vite's publicDir copies
// public/icons/* to dist-firefox/icons/* (dropping the "public/" segment),
// unlike CRXJS, which additionally preserves the full "public/icons/..."
// path for Chrome — so manifest.firefox.json can keep writing icon paths the
// same way manifest.json does, and this is the one place that reconciles it
// with Vite's actual (unadorned) output layout.
const stripPublicPrefix = (icons) =>
  Object.fromEntries(
    Object.entries(icons).map(([size, path]) => [size, path.replace(/^public\//, '')])
  );

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.firefox.json'), 'utf8'));
manifest.background.service_worker = 'background.js';
manifest.background.scripts = ['background.js'];
manifest.content_scripts[0].js = ['picker-loader.js'];
manifest.icons = stripPublicPrefix(manifest.icons);
manifest.action.default_icon = stripPublicPrefix(manifest.action.default_icon);
manifest.sidebar_action.default_icon = stripPublicPrefix(manifest.sidebar_action.default_icon);

writeFileSync(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(resolve(root, 'src/content/picker-loader.js'), resolve(outDir, 'picker-loader.js'));
console.log(`Wrote ${outDir}/manifest.json and picker-loader.js`);

// This step, unlike the two above, only reflects manifest.firefox.json and
// picker-loader.js as of process start when run with --watch (vite build
// --watch blocks until stopped) — restart `npm run dev:firefox` after
// editing either file.
const viteArgs = ['vite', 'build', '--config', 'vite.config.firefox.ts'];
if (watch) viteArgs.push('--watch');
execFileSync('npx', viteArgs, { cwd: root, stdio: 'inherit' });
