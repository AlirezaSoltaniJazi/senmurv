import { useState } from 'react';
import type { ReactElement } from 'react';
import { FillTab } from './components/FillTab';
import { GenerateDataTab } from './components/GenerateDataTab';
import { LocatorTab } from './components/LocatorTab';
import { ScriptsTab } from './components/ScriptsTab';

type TabKey = 'data' | 'locator' | 'fill' | 'scripts';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'locator', label: 'Locator' },
  { key: 'fill', label: 'Fill' },
  { key: 'scripts', label: 'Scripts' },
];

export function App(): ReactElement {
  const [tab, setTab] = useState<TabKey>('data');

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo">Senmurv</span>
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
        {tab === 'data' && <GenerateDataTab />}
        {tab === 'locator' && <LocatorTab />}
        {tab === 'fill' && <FillTab />}
        {tab === 'scripts' && <ScriptsTab />}
      </main>
    </div>
  );
}
