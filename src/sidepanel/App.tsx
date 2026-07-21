import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { MESSAGE_TYPES } from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { FontSize, Prefs, Result } from '@/shared/types';
import type { FillSeed } from '@/shared/workflow';

// Lazy-load each tab so the panel shell renders instantly; heavy deps (faker
// locales in Data/Fill, js-beautify in Scripts) load only when that tab opens.
const GenerateDataTab = lazy(() =>
  import('./components/GenerateDataTab').then((m) => ({ default: m.GenerateDataTab }))
);
const LocatorTab = lazy(() =>
  import('./components/LocatorTab').then((m) => ({ default: m.LocatorTab }))
);
const FillTab = lazy(() => import('./components/FillTab').then((m) => ({ default: m.FillTab })));
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

type TabKey = 'data' | 'locator' | 'fill' | 'scripts' | 'track' | 'mytasks' | 'notes' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'fill', label: 'Recorder' },
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
  const [fillSeed, setFillSeed] = useState<FillSeed | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  const customizeInFill = useCallback((s: FillSeed) => {
    setFillSeed(s);
    setTab('fill');
  }, []);
  const clearFillSeed = useCallback(() => setFillSeed(null), []);

  // Load persisted preferences (font size) on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<Prefs>>({ type: MESSAGE_TYPES.GET_PREFS });
      if (!cancelled && res.ok) setFontSize(res.value.fontSize);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeFontSize = useCallback((size: FontSize) => {
    setFontSize(size);
    void sendRuntimeMessage({
      type: MESSAGE_TYPES.SAVE_PREFS,
      payload: { prefs: { fontSize: size } },
    });
  }, []);

  return (
    <div className={`app font-${fontSize}`}>
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
          {tab === 'fill' && <FillTab seed={fillSeed} onSeedConsumed={clearFillSeed} />}
          {tab === 'scripts' && (
            <ScriptsTab onCustomize={customizeInFill} reloadNonce={reloadNonce} />
          )}
          {tab === 'track' && <TrackTab reloadNonce={reloadNonce} />}
          {tab === 'mytasks' && <MyTasksTab reloadNonce={reloadNonce} />}
          {tab === 'notes' && <NotesTab reloadNonce={reloadNonce} />}
          {tab === 'settings' && (
            <SettingsTab fontSize={fontSize} onFontSizeChange={changeFontSize} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
