import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Tools tab's delivery mechanism against a silent regression.
 *
 * picker.ts is a DECLARED content script — it parses on every http/https page
 * load, forever. The Tools modes therefore sit behind a dynamic `import()`, and
 * a single stray static import from picker.ts's graph into `src/shared/tools/*`
 * would fold the whole thing back into the picker chunk. Nothing would break;
 * it would just quietly cost every page load, which is exactly the kind of
 * regression no other test would notice.
 *
 * CI runs `npm run build` before `npm test`, so these assertions execute there.
 * Locally they skip when `dist/` has not been built.
 */

const DIST = path.resolve(__dirname, '../../dist');
const ASSETS = path.join(DIST, 'assets');
const hasBuild = existsSync(path.join(DIST, 'manifest.json'));

interface BuiltManifest {
  content_scripts?: { js?: string[] }[];
  web_accessible_resources?: { resources?: string[] }[];
}

/** Byte ceiling for the content script that runs on every page. */
const PICKER_CHUNK_MAX_BYTES = 32 * 1024;

describe.skipIf(!hasBuild)('bundle placement (requires `npm run build`)', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(DIST, 'manifest.json'), 'utf8')
  ) as BuiltManifest;
  const warResources = (manifest.web_accessible_resources ?? []).flatMap((e) => e.resources ?? []);
  const assetNames = readdirSync(ASSETS);
  const toolsChunk = assetNames.find((n) => /^tools-.*\.js$/.test(n));
  const pickerChunk = assetNames.find((n) => /^picker\.ts-[^l].*\.js$/.test(n));

  it('emits the Tools modes as their own chunk', () => {
    expect(toolsChunk).toBeDefined();
  });

  it('makes the Tools chunk web-accessible so the page can fetch it on demand', () => {
    // CRXJS derives this from the dynamic import — never hardcode the hashed name.
    expect(warResources).toContain(`assets/${toolsChunk}`);
  });

  it('never statically imports the Tools chunk from the picker', () => {
    expect(pickerChunk).toBeDefined();
    const source = readFileSync(path.join(ASSETS, pickerChunk as string), 'utf8');
    const staticImports = source.match(/from"\.\/[^"]+"/g) ?? [];
    expect(staticImports.join(' ')).not.toContain('tools-');
    // …and it is genuinely reached through import(), not merely absent.
    expect(source).toContain(`import(\`./${toolsChunk}\`)`);
  });

  it('keeps the always-injected picker chunk under budget', () => {
    const bytes = readFileSync(path.join(ASSETS, pickerChunk as string)).byteLength;
    expect(bytes).toBeLessThan(PICKER_CHUNK_MAX_BYTES);
  });
});
