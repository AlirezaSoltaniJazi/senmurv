import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { distinctTags, TAG_COLOR_COUNT, tagColorClass, tagUsageCounts } from '@/shared/tasks';
import type { Result, TimeEntry } from '@/shared/types';

interface Props {
  /** Tag → palette index overrides, and the setter that persists them. */
  tagColors: Record<string, number>;
  onTagColorsChange: (next: Record<string, number>) => void;
}

/** The palette index currently shown for a tag (override, else hashed default). */
function shownColorIndex(tag: string, overrides: Record<string, number>): number {
  const m = /tag-c(\d+)/.exec(tagColorClass(tag, overrides));
  return m ? Number(m[1]) : 0;
}

/**
 * Settings → Track tags: see every distinct tag (colour + usage count) and rename
 * it (updates all entries), delete it (un-tags those entries, keeps them), or
 * recolour it (cycles the 8-slot palette). Tags are derived from tracked entries.
 */
export function TagManager({ tagColors, onTagColorsChange }: Props): ReactElement {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<TimeEntry[]>>({ type: MESSAGE_TYPES.GET_TASKS });
      if (!cancelled && res.ok) setEntries(res.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tags = distinctTags(entries);
  const counts = tagUsageCounts(entries);

  function cycleColor(tag: string): void {
    const next = (shownColorIndex(tag, tagColors) + 1) % TAG_COLOR_COUNT;
    onTagColorsChange({ ...tagColors, [tag]: next });
  }

  function startRename(tag: string): void {
    setEditing(tag);
    setDraft(tag);
    setError(null);
  }

  async function commitRename(from: string): Promise<void> {
    const to = draft.trim();
    setEditing(null);
    if (to === '' || to === from) return;
    const res = await sendRuntimeMessage<Result<TimeEntry[]>>({
      type: MESSAGE_TYPES.RENAME_TAG,
      payload: { from, to },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEntries(res.value);
    // Carry the colour override to the new name.
    if (from in tagColors) {
      const idx = tagColors[from];
      const next = { ...tagColors };
      delete next[from];
      if (typeof idx === 'number' && !(to in next)) next[to] = idx;
      onTagColorsChange(next);
    }
  }

  async function remove(tag: string): Promise<void> {
    const n = counts.get(tag) ?? 0;
    if (
      !window.confirm(
        `Remove the tag “${tag}” from ${n} entr${n === 1 ? 'y' : 'ies'}? The entries are kept — just un-tagged.`
      )
    ) {
      return;
    }
    const res = await sendRuntimeMessage<Result<TimeEntry[]>>({
      type: MESSAGE_TYPES.DELETE_TAG,
      payload: { tag },
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEntries(res.value);
    if (tag in tagColors) {
      const next = { ...tagColors };
      delete next[tag];
      onTagColorsChange(next);
    }
  }

  if (tags.length === 0) {
    return <p className="hint">No tags yet — add one when you start a Track entry.</p>;
  }

  return (
    <>
      <ul className="tag-manager">
        {tags.map((tag) => (
          <li key={tag} className="tag-manager-row">
            <button
              type="button"
              className={`tag-swatch ${tagColorClass(tag, tagColors)}`}
              title="Click to change colour"
              aria-label={`Change colour for ${tag}`}
              onClick={() => cycleColor(tag)}
            />
            {editing === tag ? (
              <input
                className="name-input tag-rename"
                aria-label={`Rename ${tag}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitRename(tag)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename(tag);
                  else if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="tag-manager-name"
                title="Rename this tag"
                onClick={() => startRename(tag)}
              >
                <span className={`task-tag ${tagColorClass(tag, tagColors)}`}>{tag}</span>
              </button>
            )}
            <span className="tag-manager-count" title="Entries using this tag">
              {counts.get(tag) ?? 0}
            </span>
            <button type="button" className="danger" onClick={() => void remove(tag)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
        Rename updates every entry with that tag; delete un-tags them (entries stay). Click a swatch
        to recolour.
      </p>
      {error && <p className="error">{error}</p>}
    </>
  );
}
