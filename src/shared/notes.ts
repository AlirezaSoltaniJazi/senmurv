import type { Note } from '@/shared/types';

/** Case-insensitive match of a note against a search box query. */
export function matchesNoteQuery(note: Pick<Note, 'title' | 'body'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q);
}

/** Favorited notes first, then newest-updated first within each group. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || b.updatedAt - a.updatedAt
  );
}
