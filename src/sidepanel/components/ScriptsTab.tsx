import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { decodeBookmarklet } from '@/shared/bookmarklet';
import type { Result, SavedScript } from '@/shared/types';
import { newId } from '@/utils/id';

export function ScriptsTab(): ReactElement {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<SavedScript[]>>({
        type: MESSAGE_TYPES.GET_SCRIPTS,
      });
      if (!cancelled && res.ok) setScripts(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function resetEditor(): void {
    setEditingId(null);
    setName('');
    setCode('');
    setStatus(null);
    setError(null);
  }

  function editScript(s: SavedScript): void {
    setEditingId(s.id);
    setName(s.name);
    setCode(s.code);
    setStatus(null);
    setError(null);
  }

  async function save(): Promise<void> {
    setError(null);
    setStatus(null);
    const trimmedName = name.trim();
    if (!trimmedName || !code.trim()) {
      setError('Name and code are both required.');
      return;
    }
    const now = Date.now();
    const existing = scripts.find((s) => s.id === editingId);
    const script: SavedScript = existing
      ? { ...existing, name: trimmedName, code, updatedAt: now }
      : { id: newId('scr_'), name: trimmedName, code, createdAt: now, updatedAt: now };

    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.SAVE_SCRIPT,
      payload: { script },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setScripts(res.value);
    setEditingId(script.id);
    setStatus('Saved.');
  }

  async function remove(id: string): Promise<void> {
    const res = await sendRuntimeMessage<Result<SavedScript[]>>({
      type: MESSAGE_TYPES.DELETE_SCRIPT,
      payload: { id },
    });
    if (res.ok) {
      setScripts(res.value);
      if (editingId === id) resetEditor();
    }
  }

  async function run(script: SavedScript): Promise<void> {
    setError(null);
    setStatus(null);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.RUN_SCRIPT,
      payload: { code: script.code },
    });
    if (res.ok) setStatus(`Ran “${script.name}” in the page.`);
    else setError(res.error);
  }

  function decode(): void {
    if (!code.trim()) {
      setError('Paste a javascript: bookmarklet into the editor first.');
      return;
    }
    setCode(decodeBookmarklet(code));
    setStatus('Bookmarklet decoded into the editor.');
  }

  return (
    <div className="tab">
      <ul className="script-list">
        {scripts.length === 0 && <li className="hint">No saved scripts yet.</li>}
        {scripts.map((s) => (
          <li key={s.id} className="script-row">
            <span className="script-name">{s.name}</span>
            <span className="script-actions">
              <button type="button" className="primary" onClick={() => void run(s)}>
                Run
              </button>
              <button type="button" onClick={() => editScript(s)}>
                Edit
              </button>
              <button type="button" className="danger" onClick={() => void remove(s.id)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="section-title">{editingId ? 'Edit script' : 'New script'}</h3>
      <input
        className="name-input"
        placeholder="Script name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <textarea
        className="code-input"
        spellCheck={false}
        placeholder="// paste JS, or a javascript: bookmarklet then click Import / decode"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="row">
        <button type="button" className="primary" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={resetEditor}>
          New
        </button>
        <button type="button" onClick={decode}>
          Import / decode bookmarklet
        </button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
