import { lazy, Suspense, useCallback, useState } from 'react';
import type { ReactElement } from 'react';
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
const TasksTab = lazy(() => import('./components/TasksTab').then((m) => ({ default: m.TasksTab })));

type TabKey = 'data' | 'locator' | 'fill' | 'scripts' | 'tasks';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'fill', label: 'Fill' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'tasks', label: 'Tasks' },
];

const VERSION = chrome.runtime.getManifest().version;
const LOGO_URL = chrome.runtime.getURL('public/icons/icon-32.png');

export function App(): ReactElement {
  const [tab, setTab] = useState<TabKey>('data');
  const [fillSeed, setFillSeed] = useState<FillSeed | null>(null);

  const customizeInFill = useCallback((s: FillSeed) => {
    setFillSeed(s);
    setTab('fill');
  }, []);
  const clearFillSeed = useCallback(() => setFillSeed(null), []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={LOGO_URL} alt="" />
          <span className="logo">Senmurv</span>
          <span className="app-version">v{VERSION}</span>
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
          {tab === 'scripts' && <ScriptsTab onCustomize={customizeInFill} />}
          {tab === 'tasks' && <TasksTab />}
        </Suspense>
      </main>
    </div>
  );
}
