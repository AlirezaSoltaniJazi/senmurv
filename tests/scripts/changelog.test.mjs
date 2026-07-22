import { describe, expect, it } from 'vitest';
import { promoteChangelog } from '../../scripts/changelog.mjs';

const REPO = 'https://github.com/AlirezaSoltaniJazi/senmurv';

/** A minimal Keep-a-Changelog document with an [Unreleased] section + links. */
function sample() {
  return [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- A shiny new thing.',
    '',
    '## [0.4.0] - 2026-06-01',
    '',
    '### Added',
    '',
    '- The previous thing.',
    '',
    `[Unreleased]: ${REPO}/compare/v0.4.0...HEAD`,
    `[0.4.0]: ${REPO}/releases/tag/v0.4.0`,
    '',
  ].join('\n');
}

describe('promoteChangelog', () => {
  it('promotes [Unreleased] to a dated version and re-seeds an empty [Unreleased]', () => {
    const out = promoteChangelog(sample(), {
      version: '0.5.0',
      date: '2026-07-22',
      repoUrl: REPO,
      prevVersion: '0.4.0',
    });
    // Fresh empty Unreleased on top, then the promoted heading.
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[0\.5\.0\] - 2026-07-22\n/);
    // The unreleased notes moved under the new version, above the old release.
    const newIdx = out.indexOf('## [0.5.0]');
    const noteIdx = out.indexOf('- A shiny new thing.');
    const oldIdx = out.indexOf('## [0.4.0]');
    expect(newIdx).toBeLessThan(noteIdx);
    expect(noteIdx).toBeLessThan(oldIdx);
  });

  it('rewrites the [Unreleased] compare link and inserts a version compare link', () => {
    const out = promoteChangelog(sample(), {
      version: '0.5.0',
      date: '2026-07-22',
      repoUrl: REPO,
      prevVersion: '0.4.0',
    });
    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v0.5.0...HEAD`);
    expect(out).toContain(`[0.5.0]: ${REPO}/compare/v0.4.0...v0.5.0`);
    // The old link is preserved.
    expect(out).toContain(`[0.4.0]: ${REPO}/releases/tag/v0.4.0`);
    // Exactly one [Unreleased] link definition remains.
    expect(out.match(/^\[Unreleased\]:/gm)).toHaveLength(1);
  });

  it('uses a releases/tag link when prevVersion equals version (release current)', () => {
    const out = promoteChangelog(sample(), {
      version: '0.4.0',
      date: '2026-07-22',
      repoUrl: REPO,
      prevVersion: '0.4.0',
    });
    expect(out).toContain(`[0.4.0]: ${REPO}/releases/tag/v0.4.0`);
    expect(out).not.toContain('compare/v0.4.0...v0.4.0');
  });

  it('returns the input unchanged when there is no [Unreleased] heading', () => {
    const md = '# Changelog\n\n## [0.4.0] - 2026-06-01\n\n- Something.\n';
    const out = promoteChangelog(md, {
      version: '0.5.0',
      date: '2026-07-22',
      repoUrl: REPO,
      prevVersion: '0.4.0',
    });
    expect(out).toBe(md);
  });

  it('appends a reference-link block when none exists', () => {
    const md = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Thing.\n';
    const out = promoteChangelog(md, {
      version: '0.5.0',
      date: '2026-07-22',
      repoUrl: REPO,
      prevVersion: '0.4.0',
    });
    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v0.5.0...HEAD`);
    expect(out).toContain(`[0.5.0]: ${REPO}/compare/v0.4.0...v0.5.0`);
  });

  it('normalizes a git+…/.git repository URL', () => {
    const out = promoteChangelog(sample(), {
      version: '0.5.0',
      date: '2026-07-22',
      repoUrl: `git+${REPO}.git`,
      prevVersion: '0.4.0',
    });
    expect(out).toContain(`[Unreleased]: ${REPO}/compare/v0.5.0...HEAD`);
  });
});
