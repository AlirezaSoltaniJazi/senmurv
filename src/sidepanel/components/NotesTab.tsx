import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { matchesNoteQuery, sortNotes } from '@/shared/notes';
import type { Note, Result } from '@/shared/types';
import { newId } from '@/utils/id';

/** How long a title/body field must sit idle before an in-progress draft autosaves. */
const DRAFT_AUTOSAVE_MS = 1200;

interface Props {
  /** Bumped by the header refresh button to re-pull data from storage. */
  reloadNonce: number;
}

/** Current epoch ms — wrapped so clock reads stay outside render-purity analysis. */
function nowMs(): number {
  return Date.now();
}

/** Display heading: the title, else the note's first non-empty line, else a fallback. */
function noteHeading(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const firstLine = note.body.split('\n').find((line) => line.trim());
  return firstLine?.trim() || 'Untitled note';
}

export function NotesTab({ reloadNonce }: Props): ReactElement {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The id a brand-new, never-yet-saved draft is allocated the first time it
  // autosaves, so every later flush of the same draft updates it in place
  // instead of creating duplicates. A ref (not state) so it never fights with
  // editingId's "am I editing a pre-existing note" meaning.
  const draftIdRef = useRef<string | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kept in sync with `notes` so the visibilitychange/debounce effects below —
  // which deliberately don't list `notes` as a dependency — never read a stale
  // array when they fire (see buildNote).
  const notesRef = useRef<Note[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Load on mount and whenever the refresh button bumps the nonce.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<Note[]>>({ type: MESSAGE_TYPES.GET_NOTES });
      if (!cancelled && res.ok) setNotes(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  // Auto-dismiss the transient success message after 5 seconds.
  useEffect(() => {
    if (status === null) return undefined;
    const id = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(id);
  }, [status]);

  // Debounced autosave: persist an in-progress draft ~1.2s after the user
  // stops typing, so unsaved text is safe well before any close could happen.
  // Panel close cannot be caught directly — see the lifecycle-port note in
  // sidepanel/main.tsx — so this (not a close handler) is the actual guard.
  // Clearing the timeout on every re-run (title/body change, or unmount) is
  // what both restarts the debounce and cancels it cleanly on unmount.
  useEffect(() => {
    if (!title.trim() && !body.trim()) return undefined;
    const timerId = setTimeout(() => {
      void persistNote(activeDraftId()).then((res) => {
        if (res.ok) setNotes(res.value);
      });
    }, DRAFT_AUTOSAVE_MS);
    draftTimerRef.current = timerId;
    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Best-effort extra: also flush a non-empty draft the moment the panel is
  // hidden (tab switch, closing). Defense in depth on top of the debounce
  // above, not a replacement — visibilitychange isn't guaranteed either, so
  // this fires-and-forgets and swallows any failure (the panel may already
  // be torn down by the time the message would resolve).
  useEffect(() => {
    function onVisibilityChange(): void {
      if (!document.hidden) return;
      if (!title.trim() && !body.trim()) return;
      void persistNote(activeDraftId()).catch(() => {
        // Best-effort — nothing to do if the panel is already gone.
      });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, editingId]);

  /** The id the current draft is (or would be) saved under, allocating one on first use. */
  function activeDraftId(): string {
    if (editingId) return editingId;
    if (!draftIdRef.current) draftIdRef.current = newId('note_');
    return draftIdRef.current;
  }

  /** Build the Note to persist for `id` from the current form fields. */
  function buildNote(id: string): Note {
    const at = nowMs();
    const existing = notesRef.current.find((n) => n.id === id);
    return existing
      ? { ...existing, title: title.trim(), body, updatedAt: at }
      : { id, title: title.trim(), body, createdAt: at, updatedAt: at };
  }

  /** Upsert the current form content under `id` — the one path a manual Save
   *  and the autosave debounce both go through. */
  async function persistNote(id: string): Promise<Result<Note[]>> {
    return sendRuntimeMessage<Result<Note[]>>({
      type: MESSAGE_TYPES.SAVE_NOTE,
      payload: { note: buildNote(id) },
    });
  }

  /** Cancel any pending autosave and forget the in-progress draft's allocated id. */
  function clearDraftTimer(): void {
    if (draftTimerRef.current !== null) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    draftIdRef.current = null;
  }

  function resetEditor(): void {
    clearDraftTimer();
    setEditingId(null);
    setTitle('');
    setBody('');
    setError(null);
  }

  function editNote(note: Note): void {
    clearDraftTimer();
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setStatus(null);
    setError(null);
  }

  async function save(): Promise<void> {
    setError(null);
    setStatus(null);
    if (!title.trim() && !body.trim()) {
      setError('Write a title or some text first.');
      return;
    }
    const wasEditingExisting = editingId !== null;
    const id = activeDraftId();
    const res = await persistNote(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotes(res.value);
    if (wasEditingExisting) {
      setEditingId(id);
      setStatus('Saved.');
    } else {
      // A brand-new note: clear the form back to blank instead of silently
      // flipping into edit mode (also cancels any pending autosave timer).
      resetEditor();
      setStatus('Saved.');
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    const res = await sendRuntimeMessage<Result<Note[]>>({
      type: MESSAGE_TYPES.DELETE_NOTE,
      payload: { id },
    });
    if (res.ok) {
      setNotes(res.value);
      if (editingId === id) resetEditor();
      setExpanded((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setError(res.error);
    }
  }

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Favoriting is a metadata flag, not a content edit — updatedAt (and so the
  // recency half of sortNotes) deliberately stays untouched.
  async function toggleFavorite(note: Note): Promise<void> {
    const res = await sendRuntimeMessage<Result<Note[]>>({
      type: MESSAGE_TYPES.SAVE_NOTE,
      payload: { note: { ...note, favorite: !note.favorite } },
    });
    if (res.ok) setNotes(res.value);
    else setError(res.error);
  }

  const sorted = sortNotes(notes);
  const shown = sorted.filter((note) => matchesNoteQuery(note, query));
  // Favorited notes move into the Favorites section instead of also sitting
  // here — one canonical place per note, not a duplicate listing. `shown` is
  // already favorite-first-then-recency (via sortNotes), so both slices stay
  // correctly ordered without re-sorting.
  const favoriteNotes = shown.filter((n) => n.favorite === true);
  const otherNotes = shown.filter((n) => n.favorite !== true);

  /** Expand every currently-shown (i.e. search-filtered) note, leaving hidden ones untouched. */
  function expandAll(): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const note of shown) next.add(note.id);
      return next;
    });
  }

  /** Collapse every currently-shown (i.e. search-filtered) note, leaving hidden ones untouched. */
  function collapseAll(): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const note of shown) next.delete(note.id);
      return next;
    });
  }

  function renderNoteCard(note: Note): ReactElement {
    const isExpanded = expanded.has(note.id);
    const hasBody = note.body.trim() !== '';
    return (
      <li key={note.id} className="note-card">
        <div className="note-head">
          {hasBody && (
            <button
              type="button"
              className="expand-toggle"
              onClick={() => toggleExpand(note.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse note' : 'Expand note'}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          <button
            type="button"
            className={note.favorite ? 'star-toggle active' : 'star-toggle'}
            onClick={() => void toggleFavorite(note)}
            aria-pressed={note.favorite === true}
            aria-label={note.favorite ? 'Unfavorite note' : 'Favorite note'}
            title={note.favorite ? 'Unfavorite' : 'Favorite'}
          >
            {note.favorite ? '★' : '☆'}
          </button>
          <span className="note-title">{noteHeading(note)}</span>
          <span className="note-actions">
            <button type="button" onClick={() => editNote(note)}>
              Edit
            </button>
            <button type="button" className="danger" onClick={() => void remove(note.id)}>
              Delete
            </button>
          </span>
        </div>
        {hasBody && <p className={isExpanded ? 'note-body' : 'note-body collapsed'}>{note.body}</p>}
      </li>
    );
  }

  return (
    <div className="tab">
      <h3 className="section-title">{editingId ? 'Edit note' : 'New note'}</h3>
      <input
        className="name-input"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="note-input"
        placeholder="Write a note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="row">
        <button type="button" className="primary" onClick={() => void save()}>
          {editingId ? 'Save' : 'Add note'}
        </button>
        <button type="button" onClick={resetEditor}>
          New
        </button>
      </div>

      <div className="row">
        <input
          className="name-input"
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {sorted.length > 0 && (
        <div className="row">
          <button type="button" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      )}

      {favoriteNotes.length > 0 && (
        <>
          <h3 className="section-title">Favorites</h3>
          <ul className="note-list">{favoriteNotes.map(renderNoteCard)}</ul>
        </>
      )}

      {shown.length === 0 ? (
        <ul className="note-list">
          <li className="hint">
            {notes.length === 0 ? 'No notes yet.' : 'No note matches that search.'}
          </li>
        </ul>
      ) : (
        otherNotes.length > 0 && (
          <>
            {favoriteNotes.length > 0 && <h3 className="section-title">All notes</h3>}
            <ul className="note-list">{otherNotes.map(renderNoteCard)}</ul>
          </>
        )
      )}

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
