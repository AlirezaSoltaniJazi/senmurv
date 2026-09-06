import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { browser } from '@/shared/browser-api';
import {
  ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_DEFAULT,
  ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_DEFAULT,
  ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT,
  FIND_TIMEOUT_SECONDS_DEFAULT,
  FONT_PRESET_ZOOM,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  HUD_SECONDS_DEFAULT,
  LOCATOR_ADDED_CONFIRM_SECONDS_DEFAULT,
  LOGICAL_NAMES_MAX_DEFAULT,
  LOGIN_PREFILL_DELAY_SECONDS_DEFAULT,
  MATCH_HIGHLIGHT_MAX_DEFAULT,
  MAX_PINNED_TOOLS_DEFAULT,
  MESSAGE_TYPES,
  NAVIGATE_TIMEOUT_SECONDS_DEFAULT,
  NOTES_AUTOSAVE_MS_DEFAULT,
  SITE_DATA_CONFIRM_SECONDS_DEFAULT,
  TAB_ORDER_MAX_STOPS_DEFAULT,
} from '@/shared/constants';
import { RANDOM_NUMBER_LENGTH_DEFAULT } from '@/shared/faker-data';
import { applyLocatorSeed, newAccount } from '@/shared/accounts';
import { sendRuntimeMessage } from '@/shared/messages';
import { togglePinned, validPinnedTools } from '@/shared/tools';
import type { ToolKey } from '@/shared/tools';
import type {
  Account,
  AccountLocatorSeed,
  FontSize,
  Prefs,
  Result,
  ScriptSeed,
} from '@/shared/types';
import type { RecorderSeed, WorkflowStep } from '@/shared/workflow';
import type { AccountEditingState } from './components/AccountsTab';
import { INITIAL_LOCATOR_TAB_STATE } from './locator-tab-state';
import type { LocatorTabState } from './locator-tab-state';

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
const AccountsTab = lazy(() =>
  import('./components/AccountsTab').then((m) => ({ default: m.AccountsTab }))
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
const DataIOTab = lazy(() =>
  import('./components/DataIOTab').then((m) => ({ default: m.DataIOTab }))
);

type TabKey =
  | 'data'
  | 'locator'
  | 'recorder'
  | 'scripts'
  | 'accounts'
  | 'tools'
  | 'cookies'
  | 'storage'
  | 'track'
  | 'mytasks'
  | 'notes'
  | 'settings'
  | 'dataio';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'recorder', label: 'Recorder' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'tools', label: 'Tools' },
  { key: 'cookies', label: 'Cookies' },
  { key: 'storage', label: 'Storage' },
  { key: 'track', label: 'Track' },
  { key: 'mytasks', label: 'My Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'settings', label: 'Settings' },
  { key: 'dataio', label: 'Export/Import' },
];

const VERSION = browser.runtime.getManifest().version;
// Unprefixed — both builds' publicDir copy lands assets at icons/*; Chrome's
// dist/ additionally has a public/icons/* duplicate (CRXJS preserves the
// manifest-declared path too), but the Firefox build only has the former.
const LOGO_URL = browser.runtime.getURL('icons/icon-32.png');

function openFullPage(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('src/sidepanel/index.html') });
}

export function App(): ReactElement {
  const [tab, setTab] = useState<TabKey>('data');
  const [recorderSeed, setRecorderSeed] = useState<RecorderSeed | null>(null);
  // Kept here so an in-progress recorded flow survives switching side-panel tabs.
  const [recorderSteps, setRecorderSteps] = useState<WorkflowStep[]>([]);
  // Same reason: lazy tabs unmount on switch, so the open tool lives up here.
  const [tool, setTool] = useState<ToolKey | null>(null);
  const [scriptSeed, setScriptSeed] = useState<ScriptSeed | null>(null);
  // Lifted so the Locator tab survives switching away and back (picked
  // element, test query/results, highlight state) without losing progress.
  const [locatorState, setLocatorState] = useState<LocatorTabState>(INITIAL_LOCATOR_TAB_STATE);
  // Same reason: the Accounts tab's in-progress draft (and the generation
  // counter that forces its editor to remount when a new locator is seeded
  // into an already-open draft) survive switching away and back too.
  const [accountEditing, setAccountEditing] = useState<AccountEditingState | null>(null);
  const [accountSeedGeneration, setAccountSeedGeneration] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [fontScale, setFontScale] = useState<number | undefined>(undefined);
  // Seconds the Flow run popup lingers before auto-closing; baked into built flows.
  const [hudSeconds, setHudSeconds] = useState<number>(HUD_SECONDS_DEFAULT);
  // Seconds a Flow step waits for its element before giving up; baked into flows.
  const [findTimeoutSeconds, setFindTimeoutSeconds] = useState<number>(
    FIND_TIMEOUT_SECONDS_DEFAULT
  );
  // Seconds a saved account must be hovered before its description tooltip appears.
  const [accountTooltipDelaySeconds, setAccountTooltipDelaySeconds] = useState<number>(
    ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT
  );
  // Track-tag colour overrides (tag → palette index), persisted in prefs.
  const [tagColors, setTagColors] = useState<Record<string, number>>({});
  // Tools pinned to the top of the launcher, in pin order; persisted in prefs.
  const [pinnedTools, setPinnedTools] = useState<ToolKey[]>([]);
  // Reload the page after a Cookies / Storage change so the site picks it up.
  const [autoReloadOnChange, setAutoReloadOnChange] = useState(false);
  // How many tools can be pinned to the top of the Tools launcher at once.
  const [maxPinnedTools, setMaxPinnedTools] = useState<number>(MAX_PINNED_TOOLS_DEFAULT);
  // Cap on tab-order stops the Tab Order tool scans before giving up.
  const [tabOrderMaxStops, setTabOrderMaxStops] = useState<number>(TAB_ORDER_MAX_STOPS_DEFAULT);
  // Cap on drawn locator-match badges (Locator tab's "highlight every match").
  const [matchHighlightMax, setMatchHighlightMax] = useState<number>(MATCH_HIGHLIGHT_MAX_DEFAULT);
  // Cap on drawn Dynamics/Power Apps field labels (Logical Names tool).
  const [logicalNamesMax, setLogicalNamesMax] = useState<number>(LOGICAL_NAMES_MAX_DEFAULT);
  // Seconds one-click Accounts login waits for the navigated page to finish loading.
  const [navigateTimeoutSeconds, setNavigateTimeoutSeconds] = useState<number>(
    NAVIGATE_TIMEOUT_SECONDS_DEFAULT
  );
  // Default digit count the Data tab's random number field starts at.
  const [randomNumberLengthDefault, setRandomNumberLengthDefault] = useState<number>(
    RANDOM_NUMBER_LENGTH_DEFAULT
  );
  // Seconds the Site data tool's "click again to confirm" window stays armed.
  const [siteDataConfirmSeconds, setSiteDataConfirmSeconds] = useState<number>(
    SITE_DATA_CONFIRM_SECONDS_DEFAULT
  );
  // Seconds an Accounts login-error banner stays visible before auto-dismissing.
  const [accountLoginErrorDisplaySeconds, setAccountLoginErrorDisplaySeconds] = useState<number>(
    ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_DEFAULT
  );
  // Seconds an Accounts "Apply to group(s)" result banner stays visible.
  const [accountApplyResultDisplaySeconds, setAccountApplyResultDisplaySeconds] = useState<number>(
    ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_DEFAULT
  );
  // Milliseconds a Notes draft sits idle before autosaving.
  const [notesAutosaveMs, setNotesAutosaveMs] = useState<number>(NOTES_AUTOSAVE_MS_DEFAULT);
  // Seconds one-click Accounts login waits after page load before filling the form.
  const [loginPrefillDelaySeconds, setLoginPrefillDelaySeconds] = useState<number>(
    LOGIN_PREFILL_DELAY_SECONDS_DEFAULT
  );
  // Seconds the Locator tab's "Added!" confirmation stays visible.
  const [locatorAddedConfirmSeconds, setLocatorAddedConfirmSeconds] = useState<number>(
    LOCATOR_ADDED_CONFIRM_SECONDS_DEFAULT
  );
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

  // Locator → Accounts handoff: "Add to account" merges a tested query+kind
  // into whichever account draft is already open (starting a new one if
  // none is) WITHOUT switching tabs — the user may still be picking/testing
  // more elements on this same page before they're done with this account.
  const addLocatorToAccount = useCallback((seed: AccountLocatorSeed) => {
    setAccountEditing((prev) => ({
      account: applyLocatorSeed(prev?.account ?? newAccount(Date.now()), seed),
      isNew: prev?.isNew ?? true,
    }));
    setAccountSeedGeneration((n) => n + 1);
  }, []);

  // Locator → Accounts handoff, the other branch: apply a query+kind
  // directly to an EXISTING saved account (chosen in the Locator tab's
  // target-account picker) — persisted immediately, no editor involved.
  const applyLocatorToExistingAccount = useCallback(
    async (id: string, seed: AccountLocatorSeed): Promise<Result<void>> => {
      const res = await sendRuntimeMessage<Result<Account[]>>({
        type: MESSAGE_TYPES.APPLY_LOCATOR_TO_ACCOUNT,
        payload: { id, seed },
      });
      return res.ok ? { ok: true, value: undefined } : res;
    },
    []
  );

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
        setAccountTooltipDelaySeconds(
          res.value.accountTooltipDelaySeconds ?? ACCOUNT_TOOLTIP_DELAY_SECONDS_DEFAULT
        );
        setTagColors(res.value.tagColors ?? {});
        setAutoReloadOnChange(res.value.autoReloadOnChange ?? false);
        setMaxPinnedTools(res.value.maxPinnedTools ?? MAX_PINNED_TOOLS_DEFAULT);
        setPinnedTools(validPinnedTools(res.value.pinnedTools ?? []));
        setTabOrderMaxStops(res.value.tabOrderMaxStops ?? TAB_ORDER_MAX_STOPS_DEFAULT);
        setMatchHighlightMax(res.value.matchHighlightMax ?? MATCH_HIGHLIGHT_MAX_DEFAULT);
        setLogicalNamesMax(res.value.logicalNamesMax ?? LOGICAL_NAMES_MAX_DEFAULT);
        setNavigateTimeoutSeconds(
          res.value.navigateTimeoutSeconds ?? NAVIGATE_TIMEOUT_SECONDS_DEFAULT
        );
        setRandomNumberLengthDefault(
          res.value.randomNumberLengthDefault ?? RANDOM_NUMBER_LENGTH_DEFAULT
        );
        setSiteDataConfirmSeconds(
          res.value.siteDataConfirmSeconds ?? SITE_DATA_CONFIRM_SECONDS_DEFAULT
        );
        setAccountLoginErrorDisplaySeconds(
          res.value.accountLoginErrorDisplaySeconds ?? ACCOUNT_LOGIN_ERROR_DISPLAY_SECONDS_DEFAULT
        );
        setAccountApplyResultDisplaySeconds(
          res.value.accountApplyResultDisplaySeconds ?? ACCOUNT_APPLY_RESULT_DISPLAY_SECONDS_DEFAULT
        );
        setNotesAutosaveMs(res.value.notesAutosaveMs ?? NOTES_AUTOSAVE_MS_DEFAULT);
        setLoginPrefillDelaySeconds(
          res.value.loginPrefillDelaySeconds ?? LOGIN_PREFILL_DELAY_SECONDS_DEFAULT
        );
        setLocatorAddedConfirmSeconds(
          res.value.locatorAddedConfirmSeconds ?? LOCATOR_ADDED_CONFIRM_SECONDS_DEFAULT
        );
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
    const prefs: Prefs = {
      fontSize,
      hudSeconds,
      findTimeoutSeconds,
      accountTooltipDelaySeconds,
      maxPinnedTools,
      tabOrderMaxStops,
      matchHighlightMax,
      logicalNamesMax,
      navigateTimeoutSeconds,
      randomNumberLengthDefault,
      siteDataConfirmSeconds,
      accountLoginErrorDisplaySeconds,
      accountApplyResultDisplaySeconds,
      notesAutosaveMs,
      loginPrefillDelaySeconds,
      locatorAddedConfirmSeconds,
    };
    if (fontScale !== undefined) prefs.fontScale = fontScale;
    if (Object.keys(tagColors).length > 0) prefs.tagColors = tagColors;
    if (autoReloadOnChange) prefs.autoReloadOnChange = true;
    if (pinnedTools.length > 0) prefs.pinnedTools = pinnedTools;
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

  function changeAccountTooltipDelay(seconds: number): void {
    setAccountTooltipDelaySeconds(seconds);
    persistPrefs({ ...currentPrefs(), accountTooltipDelaySeconds: seconds });
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

  // Pin/unpin from the Tools launcher. Adding past maxPinnedTools is a no-op
  // (the launcher already disables that button; togglePinned is the backstop).
  function togglePinnedTool(key: ToolKey): void {
    const next = togglePinned(pinnedTools, key, maxPinnedTools);
    if (next === pinnedTools) return;
    setPinnedTools(next);
    const prefs = currentPrefs();
    if (next.length > 0) prefs.pinnedTools = next;
    else delete prefs.pinnedTools;
    persistPrefs(prefs);
  }

  function changeMaxPinnedTools(n: number): void {
    setMaxPinnedTools(n);
    // Shrinking the cap below the current pin count trims the overflow so
    // the stored list never exceeds what the new cap allows.
    const trimmed = pinnedTools.length > n ? pinnedTools.slice(0, n) : pinnedTools;
    if (trimmed !== pinnedTools) setPinnedTools(trimmed);
    const prefs = { ...currentPrefs(), maxPinnedTools: n };
    if (trimmed.length > 0) prefs.pinnedTools = trimmed;
    else delete prefs.pinnedTools;
    persistPrefs(prefs);
  }

  function changeTabOrderMaxStops(n: number): void {
    setTabOrderMaxStops(n);
    persistPrefs({ ...currentPrefs(), tabOrderMaxStops: n });
  }

  function changeMatchHighlightMax(n: number): void {
    setMatchHighlightMax(n);
    persistPrefs({ ...currentPrefs(), matchHighlightMax: n });
  }

  function changeLogicalNamesMax(n: number): void {
    setLogicalNamesMax(n);
    persistPrefs({ ...currentPrefs(), logicalNamesMax: n });
  }

  function changeNavigateTimeoutSeconds(n: number): void {
    setNavigateTimeoutSeconds(n);
    persistPrefs({ ...currentPrefs(), navigateTimeoutSeconds: n });
  }

  function changeRandomNumberLengthDefault(n: number): void {
    setRandomNumberLengthDefault(n);
    persistPrefs({ ...currentPrefs(), randomNumberLengthDefault: n });
  }

  function changeSiteDataConfirmSeconds(n: number): void {
    setSiteDataConfirmSeconds(n);
    persistPrefs({ ...currentPrefs(), siteDataConfirmSeconds: n });
  }

  function changeAccountLoginErrorDisplaySeconds(n: number): void {
    setAccountLoginErrorDisplaySeconds(n);
    persistPrefs({ ...currentPrefs(), accountLoginErrorDisplaySeconds: n });
  }

  function changeAccountApplyResultDisplaySeconds(n: number): void {
    setAccountApplyResultDisplaySeconds(n);
    persistPrefs({ ...currentPrefs(), accountApplyResultDisplaySeconds: n });
  }

  function changeNotesAutosaveMs(n: number): void {
    setNotesAutosaveMs(n);
    persistPrefs({ ...currentPrefs(), notesAutosaveMs: n });
  }

  function changeLoginPrefillDelaySeconds(n: number): void {
    setLoginPrefillDelaySeconds(n);
    persistPrefs({ ...currentPrefs(), loginPrefillDelaySeconds: n });
  }

  function changeLocatorAddedConfirmSeconds(n: number): void {
    setLocatorAddedConfirmSeconds(n);
    persistPrefs({ ...currentPrefs(), locatorAddedConfirmSeconds: n });
  }

  // Cmd/Ctrl + Plus/Minus/0 zooms the panel — the same shortcut the browser
  // itself uses, since the panel is its own document (chrome.sidePanel /
  // sidebar_action) and doesn't share the host tab's native zoom.
  // changeFontScale/changeFontSize are recreated every
  // render (not memoized), so listing them re-subscribes the listener each
  // render too — cheap, and the only way to guarantee it never reads stale
  // prefs (currentPrefs() closes over several independent state slices).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const base = fontScale ?? FONT_PRESET_ZOOM[fontSize];
        const next = Math.round((base + FONT_SCALE_STEP) * 100) / 100;
        changeFontScale(Math.min(FONT_SCALE_MAX, next));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const base = fontScale ?? FONT_PRESET_ZOOM[fontSize];
        const next = Math.round((base - FONT_SCALE_STEP) * 100) / 100;
        changeFontScale(Math.max(FONT_SCALE_MIN, next));
      } else if (e.key === '0') {
        e.preventDefault();
        changeFontSize('medium');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fontScale, fontSize, changeFontScale, changeFontSize]);

  // Auto-refresh: start reloads the tab that's active right now, every N seconds.
  const startAutoRefresh = useCallback((seconds: number) => {
    void browser.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then((tabs) => {
        const id = tabs[0]?.id;
        if (typeof id === 'number') setAutoRefresh({ tabId: id, seconds });
      })
      .catch(() => undefined);
  }, []);
  const stopAutoRefresh = useCallback(() => setAutoRefresh(null), []);

  // The ticking engine — reloads the captured tab on a timer while auto-refresh is
  // on. A reload of the target tab does not touch the panel, so this keeps firing
  // across panel-tool switches; it stops on Stop or when the panel (App) unmounts.
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      void browser.tabs.reload(autoRefresh.tabId).catch(() => setAutoRefresh(null));
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
          {tab === 'data' && (
            <GenerateDataTab randomNumberLengthDefault={randomNumberLengthDefault} />
          )}
          {tab === 'locator' && (
            <LocatorTab
              state={locatorState}
              setState={setLocatorState}
              onAddToAccount={addLocatorToAccount}
              onApplyToAccount={applyLocatorToExistingAccount}
              matchHighlightMax={matchHighlightMax}
              addedConfirmSeconds={locatorAddedConfirmSeconds}
            />
          )}
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
          {tab === 'accounts' && (
            <AccountsTab
              reloadNonce={reloadNonce}
              editing={accountEditing}
              setEditing={setAccountEditing}
              seedGeneration={accountSeedGeneration}
              tooltipDelaySeconds={accountTooltipDelaySeconds}
              loginErrorDisplaySeconds={accountLoginErrorDisplaySeconds}
              applyResultDisplaySeconds={accountApplyResultDisplaySeconds}
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
              pinnedTools={pinnedTools}
              onTogglePin={togglePinnedTool}
              maxPinnedTools={maxPinnedTools}
              tabOrderMaxStops={tabOrderMaxStops}
              siteDataConfirmSeconds={siteDataConfirmSeconds}
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
          {tab === 'notes' && <NotesTab reloadNonce={reloadNonce} autosaveMs={notesAutosaveMs} />}
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
              accountTooltipDelaySeconds={accountTooltipDelaySeconds}
              onAccountTooltipDelayChange={changeAccountTooltipDelay}
              tagColors={tagColors}
              onTagColorsChange={changeTagColors}
              maxPinnedTools={maxPinnedTools}
              onMaxPinnedToolsChange={changeMaxPinnedTools}
              tabOrderMaxStops={tabOrderMaxStops}
              onTabOrderMaxStopsChange={changeTabOrderMaxStops}
              matchHighlightMax={matchHighlightMax}
              onMatchHighlightMaxChange={changeMatchHighlightMax}
              logicalNamesMax={logicalNamesMax}
              onLogicalNamesMaxChange={changeLogicalNamesMax}
              navigateTimeoutSeconds={navigateTimeoutSeconds}
              onNavigateTimeoutSecondsChange={changeNavigateTimeoutSeconds}
              randomNumberLengthDefault={randomNumberLengthDefault}
              onRandomNumberLengthDefaultChange={changeRandomNumberLengthDefault}
              siteDataConfirmSeconds={siteDataConfirmSeconds}
              onSiteDataConfirmSecondsChange={changeSiteDataConfirmSeconds}
              accountLoginErrorDisplaySeconds={accountLoginErrorDisplaySeconds}
              onAccountLoginErrorDisplaySecondsChange={changeAccountLoginErrorDisplaySeconds}
              accountApplyResultDisplaySeconds={accountApplyResultDisplaySeconds}
              onAccountApplyResultDisplaySecondsChange={changeAccountApplyResultDisplaySeconds}
              notesAutosaveMs={notesAutosaveMs}
              onNotesAutosaveMsChange={changeNotesAutosaveMs}
              loginPrefillDelaySeconds={loginPrefillDelaySeconds}
              onLoginPrefillDelaySecondsChange={changeLoginPrefillDelaySeconds}
              locatorAddedConfirmSeconds={locatorAddedConfirmSeconds}
              onLocatorAddedConfirmSecondsChange={changeLocatorAddedConfirmSeconds}
            />
          )}
          {tab === 'dataio' && <DataIOTab reloadNonce={reloadNonce} />}
        </Suspense>
      </main>
    </div>
  );
}
