import { describe, expect, it } from 'vitest';
import { matchesNoteQuery, sortNotes } from '@/shared/notes';
import type { Note } from '@/shared/types';

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

describe('sortNotes', () => {
  function note(id: string, updatedAt: number, favorite?: boolean): Note {
    const n: Note = { id, title: id, body: '', createdAt: updatedAt, updatedAt };
    if (favorite !== undefined) n.favorite = favorite;
    return n;
  }

  it('puts favorited notes before non-favorited ones', () => {
    const notes = [note('a', 100), note('b', 300, true), note('c', 200)];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts newest-updated first within each group', () => {
    const notes = [note('a', 100, true), note('b', 300, true), note('c', 200, true)];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('treats missing favorite as false', () => {
    const notes = [note('a', 300), note('b', 100, true)];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input array', () => {
    const notes = [note('a', 100), note('b', 200)];
    const copy = [...notes];
    sortNotes(notes);
    expect(notes).toEqual(copy);
  });
});
