import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  FIND_TIMEOUT_SECONDS_DEFAULT,
  HUD_SECONDS_DEFAULT,
  MESSAGE_TYPES,
} from '@/shared/constants';
import { sendRuntimeMessage } from '@/shared/messages';
import type { ToolKey } from '@/shared/tools';
import type { FontSize, Prefs, Result, ScriptSeed } from '@/shared/types';
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
const ToolsTab = lazy(() => import('./components/ToolsTab').then((m) => ({ default: m.ToolsTab })));
const CookiesTab = lazy(() =>
  import('./components/CookiesTab').then((m) => ({ default: m.CookiesTab }))
);
const StorageTab = lazy(() =>
  import('./components/StorageTab').then((m) => ({ default: m.StorageTab }))
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
  | 'tools'
  | 'cookies'
  | 'storage'
  | 'track'
  | 'mytasks'
  | 'notes'
  | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'recorder', label: 'Recorder' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'tools', label: 'Tools' },
  { key: 'cookies', label: 'Cookies' },
  { key: 'storage', label: 'Storage' },
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
  // Same reason: lazy tabs unmount on switch, so the open tool lives up here.
  const [tool, setTool] = useState<ToolKey | null>(null);
  const [scriptSeed, setScriptSeed] = useState<ScriptSeed | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [fontScale, setFontScale] = useState<number | undefined>(undefined);
  // Seconds the Flow run popup lingers before auto-closing; baked into built flows.
  const [hudSeconds, setHudSeconds] = useState<number>(HUD_SECONDS_DEFAULT);
  // Seconds a Flow step waits for its element before giving up; baked into flows.
  const [findTimeoutSeconds, setFindTimeoutSeconds] = useState<number>(
    FIND_TIMEOUT_SECONDS_DEFAULT
  );
  // Track-tag colour overrides (tag → palette index), persisted in prefs.
  const [tagColors, setTagColors] = useState<Record<string, number>>({});
  // Reload the page after a Cookies / Storage change so the site picks it up.
  const [autoReloadOnChange, setAutoReloadOnChange] = useState(false);
  // Auto-refresh (Tools): the tab being reloaded + its interval, or null when off.
  // Lifted here so it survives switching Tools sub-tools / panel tabs; stops on
  // Stop or when the panel closes (this component unmounts).
  const [autoRefresh, setAutoRefresh] = useState<{ tabId: number; seconds: number } | null>(null);

  const customizeInRecorder = useCallback((s: RecorderSeed) => {
    setRecorderSeed(s);
    setTab('recorder');
  }, []);
  const clearSeed = useCallback(() => setRecorderSeed(null), []);

  // Tools → Scripts handoff: a tool generates a standalone script and hands it
  // to the Scripts editor, mirroring the Scripts → Recorder "Customize" flow.
  const saveToScripts = useCallback((name: string, code: string) => {
    setScriptSeed({ name, code });
    setTab('scripts');
  }, []);
  const clearScriptSeed = useCallback(() => setScriptSeed(null), []);

  // Switching tabs should start at the top — the panel otherwise keeps the
  // previous tab's scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  // Load persisted preferences (font size) on mount. (Reset-scroll effect above.)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await sendRuntimeMessage<Result<Prefs>>({ type: MESSAGE_TYPES.GET_PREFS });
      if (!cancelled && res.ok) {
        setFontSize(res.value.fontSize);
        setFontScale(res.value.fontScale);
        setHudSeconds(res.value.hudSeconds ?? HUD_SECONDS_DEFAULT);
        setFindTimeoutSeconds(res.value.findTimeoutSeconds ?? FIND_TIMEOUT_SECONDS_DEFAULT);
        setTagColors(res.value.tagColors ?? {});
        setAutoReloadOnChange(res.value.autoReloadOnChange ?? false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // savePrefs OVERWRITES the whole object, so every SAVE_PREFS must carry the full
  // set. Build it from current state, then apply the one field being changed —
  // otherwise changing one preference would wipe the others.
  function currentPrefs(): Prefs {
    const prefs: Prefs = { fontSize, hudSeconds, findTimeoutSeconds };
    if (fontScale !== undefined) prefs.fontScale = fontScale;
    if (Object.keys(tagColors).length > 0) prefs.tagColors = tagColors;
    if (autoReloadOnChange) prefs.autoReloadOnChange = true;
    return prefs;
  }
  function persistPrefs(prefs: Prefs): void {
    void sendRuntimeMessage({ type: MESSAGE_TYPES.SAVE_PREFS, payload: { prefs } });
  }

  // Choosing a preset clears any manual fine-tune so the preset's zoom applies.
  function changeFontSize(size: FontSize): void {
    setFontSize(size);
    setFontScale(undefined);
    const prefs = currentPrefs();
    prefs.fontSize = size;
    delete prefs.fontScale;
    persistPrefs(prefs);
  }

  // The slider overrides the preset with an exact zoom (kept alongside fontSize
  // so the nearest preset chip can still show as active).
  function changeFontScale(scale: number): void {
    setFontScale(scale);
    persistPrefs({ ...currentPrefs(), fontScale: scale });
  }

  function changeHudSeconds(seconds: number): void {
    setHudSeconds(seconds);
    persistPrefs({ ...currentPrefs(), hudSeconds: seconds });
  }

  function changeFindTimeout(seconds: number): void {
    setFindTimeoutSeconds(seconds);
    persistPrefs({ ...currentPrefs(), findTimeoutSeconds: seconds });
  }

  function changeAutoReload(next: boolean): void {
    setAutoReloadOnChange(next);
    const prefs = currentPrefs();
    if (next) prefs.autoReloadOnChange = true;
    else delete prefs.autoReloadOnChange;
    persistPrefs(prefs);
  }

  function changeTagColors(next: Record<string, number>): void {
    setTagColors(next);
    const prefs = currentPrefs();
    if (Object.keys(next).length > 0) prefs.tagColors = next;
    else delete prefs.tagColors;
    persistPrefs(prefs);
  }

  // Auto-refresh: start reloads the tab that's active right now, every N seconds.
  const startAutoRefresh = useCallback((seconds: number) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const id = tabs[0]?.id;
      if (typeof id === 'number') setAutoRefresh({ tabId: id, seconds });
    });
  }, []);
  const stopAutoRefresh = useCallback(() => setAutoRefresh(null), []);

  // The ticking engine — reloads the captured tab on a timer while auto-refresh is
  // on. A reload of the target tab does not touch the panel, so this keeps firing
  // across panel-tool switches; it stops on Stop or when the panel (App) unmounts.
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      void chrome.tabs.reload(autoRefresh.tabId).catch(() => setAutoRefresh(null));
    }, autoRefresh.seconds * 1000);
    return () => clearInterval(id);
  }, [autoRefresh]);

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
              hudSeconds={hudSeconds}
              findTimeoutSeconds={findTimeoutSeconds}
            />
          )}
          {tab === 'scripts' && (
            <ScriptsTab
              onCustomize={customizeInRecorder}
              reloadNonce={reloadNonce}
              seed={scriptSeed}
              onSeedConsumed={clearScriptSeed}
            />
          )}
          {tab === 'tools' && (
            <ToolsTab
              tool={tool}
              setTool={setTool}
              onSaveScript={saveToScripts}
              autoRefresh={autoRefresh}
              onStartAutoRefresh={startAutoRefresh}
              onStopAutoRefresh={stopAutoRefresh}
            />
          )}
          {tab === 'cookies' && (
            <CookiesTab autoReload={autoReloadOnChange} onAutoReloadChange={changeAutoReload} />
          )}
          {tab === 'storage' && (
            <StorageTab autoReload={autoReloadOnChange} onAutoReloadChange={changeAutoReload} />
          )}
          {tab === 'track' && <TrackTab reloadNonce={reloadNonce} tagColors={tagColors} />}
          {tab === 'mytasks' && <MyTasksTab reloadNonce={reloadNonce} />}
          {tab === 'notes' && <NotesTab reloadNonce={reloadNonce} />}
          {tab === 'settings' && (
            <SettingsTab
              fontSize={fontSize}
              onFontSizeChange={changeFontSize}
              fontScale={fontScale}
              onFontScaleChange={changeFontScale}
              hudSeconds={hudSeconds}
              onHudSecondsChange={changeHudSeconds}
              findTimeoutSeconds={findTimeoutSeconds}
              onFindTimeoutChange={changeFindTimeout}
              tagColors={tagColors}
              onTagColorsChange={changeTagColors}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
