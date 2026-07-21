import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { Note, Result } from '@/shared/types';
import { newId } from '@/utils/id';

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

  function resetEditor(): void {
    setEditingId(null);
    setTitle('');
    setBody('');
    setError(null);
  }

  function editNote(note: Note): void {
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
    const at = nowMs();
    const existing = notes.find((n) => n.id === editingId);
    const note: Note = existing
      ? { ...existing, title: title.trim(), body, updatedAt: at }
      : { id: newId('note_'), title: title.trim(), body, createdAt: at, updatedAt: at };
    const res = await sendRuntimeMessage<Result<Note[]>>({
      type: MESSAGE_TYPES.SAVE_NOTE,
      payload: { note },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotes(res.value);
    setEditingId(note.id);
    setStatus('Saved.');
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
    } else {
      setError(res.error);
    }
  }

  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

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

      <ul className="note-list">
        {sorted.length === 0 && <li className="hint">No notes yet.</li>}
        {sorted.map((note) => (
          <li key={note.id} className="note-card">
            <div className="note-head">
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
            {note.body.trim() && <p className="note-body">{note.body}</p>}
          </li>
        ))}
      </ul>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
