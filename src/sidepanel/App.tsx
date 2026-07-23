import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { FontSize, Prefs, Result } from '@/shared/types';
import type { RecorderSeed, WorkflowStep } from '@/shared/workflow';

// Lazy-load each tab so the panel shell renders instantly; heavy deps (faker
// locales in Data/Fill, js-beautify in Scripts) load only when that tab opens.
const GenerateDataTab = lazy(() =>
  import('./components/GenerateDataTab').then((m) => ({ default: m.GenerateDataTab }))
);
const LocatorTab = lazy(() =>
  import('./components/LocatorTab').then((m) => ({ default: m.LocatorTab }))
);
const RecorderTab = lazy(() =>
  import('./components/RecorderTab').then((m) => ({ default: m.RecorderTab }))
);
const ScriptsTab = lazy(() =>
  import('./components/ScriptsTab').then((m) => ({ default: m.ScriptsTab }))
);
const TrackTab = lazy(() => import('./components/TrackTab').then((m) => ({ default: m.TrackTab })));
const MyTasksTab = lazy(() =>
  import('./components/MyTasksTab').then((m) => ({ default: m.MyTasksTab }))
);
const NotesTab = lazy(() => import('./components/NotesTab').then((m) => ({ default: m.NotesTab })));
const SettingsTab = lazy(() =>
  import('./components/SettingsTab').then((m) => ({ default: m.SettingsTab }))
);

type TabKey =
  | 'data'
  | 'locator'
  | 'recorder'
  | 'scripts'
  | 'track'
  | 'mytasks'
  | 'notes'
  | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'recorder', label: 'Recorder' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'track', label: 'Track' },
  { key: 'mytasks', label: 'My Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'settings', label: 'Settings' },
];

const VERSION = chrome.runtime.getManifest().version;
const LOGO_URL = chrome.runtime.getURL('public/icons/icon-32.png');

function openFullPage(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html') });
}

export function App(): ReactElement {
  const [tab, setTab] = useState<TabKey>('data');
  const [recorderSeed, setRecorderSeed] = useState<RecorderSeed | null>(null);
  // Kept here so an in-progress recorded flow survives switching side-panel tabs.
  const [recorderSteps, setRecorderSteps] = useState<WorkflowStep[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [fontScale, setFontScale] = useState<number | undefined>(undefined);

  const customizeInRecorder = useCallback((s: RecorderSeed) => {
    setRecorderSeed(s);
    setTab('recorder');
  }, []);
  const clearSeed = useCallback(() => setRecorderSeed(null), []);

  // Load persisted preferences (font size) on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<Prefs>>({ type: MESSAGE_TYPES.GET_PREFS });
      if (!cancelled && res.ok) {
        setFontSize(res.value.fontSize);
        setFontScale(res.value.fontScale);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset scroll to the top of the panel whenever the active tab changes, so a
  // new tab always starts at its header instead of inheriting the prior scroll.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Choosing a preset clears any manual fine-tune so the preset's zoom applies.
  const changeFontSize = useCallback((size: FontSize) => {
    setFontSize(size);
    setFontScale(undefined);
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.SAVE_PREFS,
      payload: { prefs: { fontSize: size } },
    });
  }, []);

  // The slider overrides the preset with an exact zoom (kept alongside fontSize
  // so the nearest preset chip can still show as active).
  const changeFontScale = useCallback(
    (scale: number) => {
      setFontScale(scale);
      void sendRuntimeMessage({
        type: MESSAGE_TYPES.SAVE_PREFS,
        payload: { prefs: { fontSize, fontScale: scale } },
      });
    },
    [fontSize]
  );

  return (
    <div
      className={`app font-${fontSize}`}
      style={fontScale !== undefined ? { zoom: fontScale } : undefined}
    >
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={LOGO_URL} alt="" />
          <span className="logo">Senmurv</span>
          <span className="app-version">v{VERSION}</span>
          <div className="header-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setReloadNonce((n) => n + 1)}
              title="Refresh data from storage"
              aria-label="Refresh"
            >
              ↻
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={openFullPage}
              title="Open in a full page"
              aria-label="Open in full page"
            >
              ⛶
            </button>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-body">
        <Suspense fallback={<p className="hint">Loading…</p>}>
          {tab === 'data' && <GenerateDataTab />}
          {tab === 'locator' && <LocatorTab />}
          {tab === 'recorder' && (
            <RecorderTab
              seed={recorderSeed}
              onSeedConsumed={clearSeed}
              steps={recorderSteps}
              setSteps={setRecorderSteps}
            />
          )}
          {tab === 'scripts' && (
            <ScriptsTab onCustomize={customizeInRecorder} reloadNonce={reloadNonce} />
          )}
          {tab === 'track' && <TrackTab reloadNonce={reloadNonce} />}
          {tab === 'mytasks' && <MyTasksTab reloadNonce={reloadNonce} />}
          {tab === 'notes' && <NotesTab reloadNonce={reloadNonce} />}
          {tab === 'settings' && (
            <SettingsTab
              fontSize={fontSize}
              onFontSizeChange={changeFontSize}
              fontScale={fontScale}
              onFontScaleChange={changeFontScale}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
