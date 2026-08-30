import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import { MESSAGE_TYPES } from '@/shared/constants';
import { isRuntimeMessage, sendRuntimeMessage } from '@/shared/messages';
import { parseColor, toFormats } from '@/shared/tools/color';
import type {
  ColorFormats,
  ColorReport,
  ColorSwatch,
  ContrastVerdict,
  ToolPickData,
} from '@/shared/types';
import { CopyButton } from '@/sidepanel/components/CopyButton';
import { FrameworkChips, LocatorSuggestions } from '@/sidepanel/components/LocatorSuggestions';
import type { FrameworkFilter } from '@/sidepanel/components/LocatorSuggestions';

type ColorPick = Extract<ToolPickData, { tool: 'color' }>;

/** The little colour square. `rgba()` inline so it shows real alpha over the panel. */
function Chip({ css }: { css: string }): ReactElement {
  return <span className="swatch" style={{ background: css }} aria-hidden="true" />;
}

function Formats({ f }: { f: ColorFormats }): ReactElement {
  const rows: [string, string][] = [
    ['HEX', f.hex],
    ['HEX8', f.hex8],
    ['RGB', f.rgb],
    ['HSL', f.hsl],
    ['HWB', f.hwb],
  ];
  return (
    <div className="data-list">
      {rows.map(([k, v]) => (
        <div className="data-row" key={k}>
          <span className="data-key">{k}</span>
          <span className="data-value">{v}</span>
          <CopyButton text={v} />
        </div>
      ))}
    </div>
  );
}

function SwatchRow({ swatch }: { swatch: ColorSwatch }): ReactElement {
  return (
    <div className="swatch-row">
      <Chip css={swatch.rgba ? swatch.raw : 'transparent'} />
      <span className="swatch-role">{swatch.role}</span>
      <code className="snippet-code">{swatch.formats?.hex ?? swatch.raw}</code>
      {swatch.formats && <CopyButton text={swatch.formats.hex} />}
    </div>
  );
}

function Verdict({ label, ok }: { label: string; ok: boolean }): ReactElement {
  return <span className={ok ? 'badge pass' : 'badge fail'}>{label}</span>;
}

function ContrastView({ c }: { c: ContrastVerdict }): ReactElement {
  // Grade for the ACTUAL text size, but show both thresholds so it is auditable.
  return (
    <>
      <div className="row">
        <span className="contrast-ratio">{c.ratio}:1</span>
        <span className="dim">{c.isLargeText ? 'large text' : 'normal text'}</span>
      </div>
      <div className="chips">
        <Verdict label={`AA ${c.aaNormal ? '✓' : '✗'}`} ok={c.aaNormal} />
        <Verdict label={`AA large ${c.aaLarge ? '✓' : '✗'}`} ok={c.aaLarge} />
        <Verdict label={`AAA ${c.aaaNormal ? '✓' : '✗'}`} ok={c.aaaNormal} />
        <Verdict label={`AAA large ${c.aaaLarge ? '✓' : '✗'}`} ok={c.aaaLarge} />
      </div>
    </>
  );
}

function ReportView({ report }: { report: ColorReport }): ReactElement {
  const primary = report.swatches.filter(
    (s) => s.role === 'text' || s.role === 'effective background'
  );
  const others = report.swatches.filter(
    (s) => s.role !== 'text' && s.role !== 'effective background'
  );
  return (
    <>
      {report.contrast !== null && (
        <>
          <h3 className="section-title">Contrast</h3>
          <ContrastView c={report.contrast} />
        </>
      )}
      {primary.map((s) => (
        <div key={s.role}>
          <h3 className="section-title">{s.role}</h3>
          <SwatchRow swatch={s} />
          {s.formats && <Formats f={s.formats} />}
        </div>
      ))}
      {others.length > 0 && (
        <>
          <h3 className="section-title">Other colours</h3>
          {others.map((s) => (
            <SwatchRow key={s.role} swatch={s} />
          ))}
        </>
      )}
      {report.warnings.map((w) => (
        <p className="hint" key={w}>
          {w}
        </p>
      ))}
    </>
  );
}

export function ColorTool(): ReactElement {
  const [live, setLive] = useState<ColorReport | null>(null);
  const [picked, setPicked] = useState<ColorPick | null>(null);
  const [eyedrop, setEyedrop] = useState<ColorFormats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FrameworkFilter>('all');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.START_TOOL_MODE,
      payload: { mode: 'color' },
    });
  }, []);

  useEffect(() => {
    function onMessage(message: unknown): void {
      if (!isRuntimeMessage(message)) return;
      if (message.type === MESSAGE_TYPES.TOOL_STREAM && message.payload.tool === 'color') {
        setLive(message.payload.data);
      } else if (message.type === MESSAGE_TYPES.TOOL_PICKED && message.payload.tool === 'color') {
        setPicked(message.payload);
        setLive(message.payload.data);
      }
    }
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  function pickScreen(): void {
    const Ctor = window.EyeDropper;
    if (Ctor === undefined) return;
    setError(null);
    // A second open() throws InvalidStateError — abort any in-flight pick first.
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // Call open() with NO preceding await, or the transient activation is spent.
    new Ctor()
      .open({ signal: ac.signal })
      .then((res) => {
        const rgba = parseColor(res.sRGBHex);
        if (rgba) setEyedrop(toFormats(rgba));
      })
      .catch(() => {
        // AbortError (superseded) or NotAllowedError (cancelled) — nothing to show.
      });
  }

  const reading = picked?.data ?? live;

  return (
    <>
      <div className="row">
        {hasEyeDropper ? (
          <button type="button" className="primary" onClick={pickScreen}>
            Pick a screen colour
          </button>
        ) : (
          <p className="hint">
            The screen eyedropper is unavailable in this browser (not on Linux Wayland, Android, or
            older Chrome). Hover the page to read element colours instead.
          </p>
        )}
      </div>
      {error !== null && <p className="error">{error}</p>}

      {eyedrop !== null && (
        <div>
          <h3 className="section-title">Picked pixel</h3>
          <SwatchRow
            swatch={{
              role: 'pixel',
              raw: eyedrop.hex,
              rgba: parseColor(eyedrop.hex),
              formats: eyedrop,
            }}
          />
          <Formats f={eyedrop} />
        </div>
      )}

      <p className="hint">Hover an element for its colours and WCAG contrast; click to pin it.</p>
      {reading === null ? (
        <p className="hint dim">No element inspected yet.</p>
      ) : (
        <ReportView report={reading} />
      )}

      {picked?.locators && (
        <>
          <h3 className="section-title">Locators</h3>
          <FrameworkChips filter={filter} onChange={setFilter} />
          <LocatorSuggestions suggestions={picked.locators.suggestions} filter={filter} />
        </>
      )}
    </>
  );
}
