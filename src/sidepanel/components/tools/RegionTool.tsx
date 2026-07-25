import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import { configForRegion, findRegion, REGIONS } from '@/shared/tools/region';
import type { RegionPreset } from '@/shared/tools/region';
import type { RegionConfig, Result } from '@/shared/types';

const FIRST = REGIONS[0] as RegionPreset;

type RegionState = { active: boolean; config: RegionConfig | null };

/** The local time in a preset's region at instant `now`, formatted in the panel. */
function previewTime(preset: RegionPreset, now: number): string {
  try {
    return new Date(now).toLocaleString(preset.locale, {
      timeZone: preset.timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date(now).toLocaleString();
  }
}

export function RegionTool(): ReactElement {
  const [regionId, setRegionId] = useState(FIRST.id);
  const [includeGeo, setIncludeGeo] = useState(true);
  const [active, setActive] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const preset = findRegion(regionId) ?? FIRST;

  async function refreshState(): Promise<void> {
    const res = await sendRuntimeMessage<Result<RegionState>>({
      type: MESSAGE_TYPES.GET_REGION_STATE,
    });
    if (!res.ok) return;
    setActive(res.value.active);
    const cfg = res.value.config;
    if (res.value.active && cfg) {
      const match = REGIONS.find((r) => r.timezone === cfg.timezone && r.locale === cfg.locale);
      setActiveLabel(match ? `${match.flag} ${match.label}` : `${cfg.timezone} · ${cfg.locale}`);
    } else {
      setActiveLabel(null);
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshState();
    })();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function apply(): Promise<void> {
    setError(null);
    const res = await sendRuntimeMessage<Result<void>>({
      type: MESSAGE_TYPES.APPLY_REGION,
      payload: { config: configForRegion(preset, includeGeo) },
    });
    if (res.ok) {
      setStatus(
        `Emulating ${preset.flag} ${preset.label}. This affects page code that runs from now on; reloading the page clears it.`
      );
      void refreshState();
    } else {
      setError(res.error);
    }
  }

  async function restore(): Promise<void> {
    setError(null);
    const res = await sendRuntimeMessage<Result<void>>({ type: MESSAGE_TYPES.RESTORE_REGION });
    if (res.ok) {
      setStatus('Restored the real region.');
      void refreshState();
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <p className="hint">
        Make this page’s JavaScript read another country’s <strong>clock</strong>,{' '}
        <strong>timezone</strong>, <strong>locale</strong> and <strong>geolocation</strong> — to
        test date/time rendering, `Intl` formatting and location-aware UI as if you were there.
      </p>

      {active && activeLabel !== null && (
        <div className="status">Currently emulating: {activeLabel}</div>
      )}

      <div className="data-list">
        <div className="data-row">
          <span className="data-key">Region</span>
          <select
            aria-label="Region"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
          >
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.flag} {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="data-row">
          <span className="data-key">Local time there</span>
          <span className="data-value">
            {previewTime(preset, now)} · {preset.locale}
          </span>
        </div>
        <div className="data-row">
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={includeGeo}
              onChange={(e) => setIncludeGeo(e.target.checked)}
            />
            Also spoof geolocation ({preset.lat.toFixed(2)}, {preset.lon.toFixed(2)})
          </label>
        </div>
      </div>

      <div className="row">
        <button type="button" className="primary" onClick={() => void apply()}>
          {active ? 'Switch region' : 'Apply'}
        </button>
        <button type="button" disabled={!active} onClick={() => void restore()}>
          Restore
        </button>
      </div>

      <div className="stack-warn">
        <strong>Client-side only.</strong> This changes what page JavaScript sees — it does{' '}
        <em>not</em> change your IP (the server still sees your real country) or the{' '}
        <code>Accept-Language</code> request header, so a site that decides locale/region from those
        won’t switch. It affects code that runs after you apply it, and a page reload clears it.
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}
