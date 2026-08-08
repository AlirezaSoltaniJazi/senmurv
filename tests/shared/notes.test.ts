import { describe, expect, it } from 'vitest';
import { matchesNoteQuery } from '@/shared/notes';

describe('matchesNoteQuery', () => {
  const note = { title: 'Release checklist', body: 'Verify the staging deploy first.' };

  it('matches an empty query', () => {
    expect(matchesNoteQuery(note, '')).toBe(true);
    expect(matchesNoteQuery(note, '   ')).toBe(true);
  });

  it('matches the title', () => {
    expect(matchesNoteQuery(note, 'release')).toBe(true);
  });

  it('matches the body', () => {
    expect(matchesNoteQuery(note, 'staging')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesNoteQuery(note, 'nope')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesNoteQuery(note, 'RELEASE')).toBe(true);
    expect(matchesNoteQuery(note, 'StAgInG')).toBe(true);
  });
});
