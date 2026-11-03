import { Crown, Database, Swords, UserRound, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { bundledDataSource } from '../shared/data/bundled';
import { fallbackDataSource, remoteJsonDataSource, type GameDataSource } from '../shared/data/source';
import { ToastHost } from './components/ui';
import { GameDataProvider, useGame } from './data/GameDataContext';
import { StoreProvider, useStore, type Tab } from './state/store';
import { ChampionsView } from './views/ChampionsView';
import { DataView } from './views/DataView';
import { HeroesView } from './views/HeroesView';
import { SimulateView } from './views/SimulateView';
import { TeamsView } from './views/TeamsView';

/**
 * Data source for the app. Set VITE_GAME_DATA_URL at build time to load the
 * newest data from a hosted JSON (or an API adapter) with the bundled data as
 * fallback; otherwise the bundled data is used.
 */
export function defaultDataSource(): GameDataSource {
  const url = import.meta.env?.VITE_GAME_DATA_URL;
  return url ? fallbackDataSource(remoteJsonDataSource(url), bundledDataSource()) : bundledDataSource();
}

const defaultSource = defaultDataSource();

export function App({ source = defaultSource }: { source?: GameDataSource }): JSX.Element {
  return (
    <GameDataProvider source={source}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </GameDataProvider>
  );
}

const NAV: Array<{ tab: Tab; label: string; icon: ReactNode }> = [
  { tab: 'heroes', label: 'Heroes', icon: <UserRound size={17} /> },
  { tab: 'champions', label: 'Champions', icon: <Crown size={17} /> },
  { tab: 'teams', label: 'Teams', icon: <UsersRound size={17} /> },
  { tab: 'simulate', label: 'Simulate', icon: <Swords size={17} /> },
  { tab: 'data', label: 'Data', icon: <Database size={17} /> }
];

function Shell(): JSX.Element {
  const store = useStore();
  const { data } = useGame();
  const tab = store.prefs.tab;
  const counts: Partial<Record<Tab, number>> = { heroes: store.heroes.length, champions: store.champions.length, teams: store.teams.length };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            TF
          </span>
          <span className="brand-text">
            <strong>TitanForge</strong>
            <small>Shop Titans hero planner</small>
          </span>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((entry) => (
            <button
              key={entry.tab}
              type="button"
              className={`nav-item ${tab === entry.tab ? 'is-active' : ''} ${entry.tab === 'data' ? 'nav-item-secondary' : ''}`}
              aria-current={tab === entry.tab ? 'page' : undefined}
              onClick={() => store.setTab(entry.tab)}
            >
              {entry.icon}
              <span>{entry.label}</span>
              {counts[entry.tab] ? <span className="nav-count">{counts[entry.tab]}</span> : null}
            </button>
          ))}
        </nav>
        <button type="button" className="data-chip" title="Game data version — click for details" onClick={() => store.setTab('data')}>
          {data.metadata.officialSpreadsheetVersion.replace(/ \/ spreadsheet.*$/, '')}
        </button>
      </header>

      <main className="main" id="main">
        {tab === 'heroes' && <HeroesView />}
        {tab === 'champions' && <ChampionsView />}
        {tab === 'teams' && <TeamsView />}
        {tab === 'simulate' && <SimulateView />}
        {tab === 'data' && <DataView />}
      </main>

      <footer className="footer">
        TitanForge is a fan project, not affiliated with or endorsed by Kabam. Shop Titans is a trademark of Kabam Games, Inc.
      </footer>
      <ToastHost />
    </div>
  );
}
