import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import {
  buildClearPlan,
  CLEAR_TYPE_LABELS,
  CLEAR_TYPES,
  describePlan,
  formatBytes,
  isSessionDestroying,
  PRESET_BUST_CACHE,
  PRESET_FRESH_VISITOR,
} from '@/shared/tools/site-data';
import type { ClearOutcome, ClearTypeId, Result, StorageProbe } from '@/shared/types';

/** How long the confirm stays armed before disarming itself. */
const CONFIRM_MS = 3000;

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="data-row">
      <span className="data-key">{label}</span>
      <span className="data-value">{value}</span>
    </div>
  );
}

/** Chrome's `usageDetails` keys that map onto a named row, so their bytes fold in. */
const MAPPED_DETAIL_KEYS = new Set(['caches', 'indexedDB', 'serviceWorkerRegistrations']);

/** "6 stores · 430 MB" — count and/or bytes, whichever we actually have. */
function summary(count: number | null, unit: string, bytes: number | null): string | null {
  const parts: string[] = [];
  if (count !== null) parts.push(`${count} ${unit}${count === 1 ? '' : 's'}`);
  if (bytes !== null) parts.push(formatBytes(bytes));
  return parts.length === 0 ? null : parts.join(' · ');
}

function ProbeView({ probe }: { probe: StorageProbe }): ReactElement {
  const bytesFor = (key: string): number | null =>
    probe.details.find((d) => d.key === key)?.bytes ?? null;

  // One row per storage type, count and bytes merged. Anything Chrome reports
  // that we don't have a named row for (its own "other", browser-specific keys)
  // is listed after, so nothing is silently dropped.
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null): void => {
    if (value !== null) rows.push({ label, value });
  };
  push('Cache Storage', summary(probe.cacheCount, 'store', bytesFor('caches')));
  push('IndexedDB', summary(probe.indexedDbCount, 'database', bytesFor('indexedDB')));
  push(
    'Service workers',
    summary(probe.serviceWorkerCount, 'worker', bytesFor('serviceWorkerRegistrations'))
  );
  push('Local storage', summary(null, '', probe.localStorageBytes));
  push('Session storage', summary(null, '', probe.sessionStorageBytes));
  push('Cookies (non-HttpOnly)', summary(probe.cookieCount, 'cookie', null));
  for (const d of probe.details) {
    if (!MAPPED_DETAIL_KEYS.has(d.key)) push(d.key, formatBytes(d.bytes));
  }

  return (
    <>
      <div className="data-list">
        <Row label="origin" value={probe.origin} />
        <Row
          label="quota used"
          value={
            probe.quota === null
              ? formatBytes(probe.usage)
              : `${formatBytes(probe.usage)} of ${formatBytes(probe.quota)}`
          }
        />
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
      {!probe.isSecureContext && (
        <p className="hint">
          This page is not a secure context, so Cache Storage, service workers and the storage
          estimate are unavailable. (<code>http://localhost</code> counts as secure — most other
          plain-http pages do not.)
        </p>
      )}
      {probe.warnings.map((w) => (
        <p className="hint" key={w}>
          {w}
        </p>
      ))}
    </>
  );
}

export function SiteDataTool(): ReactElement {
  const [probe, setProbe] = useState<StorageProbe | null>(null);
  const [types, setTypes] = useState<ClearTypeId[]>([...PRESET_BUST_CACHE]);
  const [shouldReload, setShouldReload] = useState(true);
  const [outcome, setOutcome] = useState<ClearOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [armedUntil, setArmedUntil] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    const res = await sendRuntimeMessage<Result<StorageProbe>>({
      type: MESSAGE_TYPES.PROBE_SITE_STORAGE,
    });
    if (res.ok) {
      setProbe(res.value);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  // The confirm disarms itself, so a half-finished decision cannot sit there
  // waiting to be clicked later by accident.
  useEffect(() => {
    if (armedUntil === 0) return undefined;
    const t = setTimeout(() => setArmedUntil(0), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [armedUntil]);

  const plan = probe === null ? null : buildClearPlan(probe.origin, types);
  const needsConfirm = isSessionDestroying(types);
  const isArmed = armedUntil > 0;

  function toggle(type: ClearTypeId): void {
    setArmedUntil(0);
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function applyPreset(preset: readonly ClearTypeId[]): void {
    setArmedUntil(0);
    setTypes([...preset]);
  }

  async function clear(): Promise<void> {
    if (needsConfirm && !isArmed) {
      setArmedUntil(Date.now() + CONFIRM_MS);
      return;
    }
    setArmedUntil(0);
    setError(null);
    setIsBusy(true);
    const res = await sendRuntimeMessage<Result<ClearOutcome>>({
      type: MESSAGE_TYPES.CLEAR_SITE_DATA,
      payload: { types, shouldReload },
    });
    setIsBusy(false);
    if (res.ok) {
      setOutcome(res.value);
      await refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <div className="row">
        <button type="button" onClick={() => void refresh()} disabled={isBusy}>
          ↻ Refresh
        </button>
        <button type="button" onClick={() => applyPreset(PRESET_BUST_CACHE)}>
          Bust cache
        </button>
        <button type="button" onClick={() => applyPreset(PRESET_FRESH_VISITOR)}>
          Fresh visitor
        </button>
      </div>

      {error !== null && <p className="error">{error}</p>}
      {probe !== null && <ProbeView probe={probe} />}

      <h3 className="section-title">What to clear</h3>
      {CLEAR_TYPES.map((type) => (
        <label className="checkbox-inline" key={type}>
          <input type="checkbox" checked={types.includes(type)} onChange={() => toggle(type)} />
          {CLEAR_TYPE_LABELS[type]}
        </label>
      ))}
      <label className="checkbox-inline">
        <input
          type="checkbox"
          checked={shouldReload}
          onChange={(e) => setShouldReload(e.target.checked)}
        />
        Hard-reload the page afterwards
      </label>

      {plan !== null && plan.ok && <p className="hint">{describePlan(plan.value)}</p>}
      {plan !== null && !plan.ok && <p className="hint">{plan.error}</p>}

      <div className="row">
        <button
          type="button"
          className={isArmed ? 'danger' : 'primary'}
          disabled={isBusy || plan === null || !plan.ok}
          onClick={() => void clear()}
        >
          {isArmed
            ? 'Really clear — click again'
            : shouldReload
              ? 'Clear + hard reload'
              : 'Clear site data'}
        </button>
      </div>

      {outcome !== null && (
        <div className="data-list">
          <Row
            label="cleared"
            value={
              outcome.cleared.length === 0
                ? 'nothing'
                : outcome.cleared.map((t) => CLEAR_TYPE_LABELS[t]).join(', ')
            }
          />
          {outcome.didReload && <Row label="page" value="hard-reloaded" />}
        </div>
      )}
      {outcome?.skipped.map((s) => (
        <p className="error" key={s.type}>
          {CLEAR_TYPE_LABELS[s.type]} could not be cleared: {s.reason}
        </p>
      ))}
    </>
  );
}
