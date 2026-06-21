#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const bump = process.argv[2];
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const pkgPath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'manifest.json');

const pkgText = readFileSync(pkgPath, 'utf8');
const manifestText = readFileSync(manifestPath, 'utf8');

const pkgVersion = JSON.parse(pkgText).version;
const manifestVersion = JSON.parse(manifestText).version;

if (pkgVersion !== manifestVersion) {
  console.error(
    `Version mismatch: package.json=${pkgVersion} manifest.json=${manifestVersion}. Reconcile manually before bumping.`
  );
  process.exit(1);
}

const parts = pkgVersion.split('.').map(Number);
if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
  console.error(`package.json version "${pkgVersion}" is not a plain semver MAJOR.MINOR.PATCH.`);
  process.exit(1);
}
const [major, minor, patch] = parts;

let next;
if (bump === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (bump === 'minor') next = `${major}.${minor + 1}.0`;
else next = `${major + 1}.0.0`;

// Replace only the top-level "version" field in each file. This preserves
// the rest of the file's formatting exactly (so Prettier check still passes
// after CI bumps the version).
function replaceVersion(text, current, next) {
  const needle = `"version": "${current}"`;
  if (!text.includes(needle)) {
    throw new Error(`Could not find "${needle}" — check the file's formatting.`);
  }
  return text.replace(needle, `"version": "${next}"`);
}

writeFileSync(pkgPath, replaceVersion(pkgText, pkgVersion, next));
writeFileSync(manifestPath, replaceVersion(manifestText, manifestVersion, next));

console.log(next);
