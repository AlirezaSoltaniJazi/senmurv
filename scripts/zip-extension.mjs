#!/usr/bin/env node
import AdmZip from 'adm-zip';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');

if (!existsSync(distDir)) {
  console.error('dist/ does not exist. Run `npm run build` first.');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

const suffixArg = process.argv.find((a) => a.startsWith('--suffix='));
const suffix = suffixArg ? suffixArg.slice('--suffix='.length) : '';
const nameParts = ['senmurv'];
if (suffix) nameParts.push(suffix);
nameParts.push(version);

mkdirSync(releaseDir, { recursive: true });

const zip = new AdmZip();
zip.addLocalFolder(distDir);

const outPath = resolve(releaseDir, `${nameParts.join('-')}.zip`);
zip.writeZip(outPath);
console.log(`Wrote ${outPath}`);
