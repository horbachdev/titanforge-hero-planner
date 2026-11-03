import { BookOpen, Castle, ScrollText } from 'lucide-react';
import { bundledDataSource } from '../shared/data/bundled';
import { fallbackDataSource, remoteJsonDataSource, type GameDataSource } from '../shared/data/source';
import { BrandMark } from './components/art';
import { ToastHost } from './components/ui';
import { GameDataProvider, useGame } from './data/GameDataContext';
import { StoreProvider, useStore, type Route } from './state/store';
import { BarracksView } from './views/BarracksView';
import { ChampionSheet } from './views/ChampionSheet';
import { HeroSheet } from './views/HeroSheet';
import { LedgerView } from './views/LedgerView';
import { QuestsView } from './views/QuestsView';

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

function Shell(): JSX.Element {
  const store = useStore();
  const { data } = useGame();
  const route = store.prefs.route;
  const section = route.page === 'hero' || route.page === 'champion' ? 'barracks' : route.page;

  const navItem = (page: Route['page'], label: string, icon: JSX.Element, count?: number) => (
    <button
      type="button"
      className={`nav-item ${section === page ? 'is-active' : ''}`}
      aria-current={section === page ? 'page' : undefined}
      onClick={() => store.navigate({ page } as Route)}
    >
      {icon}
      <span>{label}</span>
      {count ? <span className="nav-count">{count}</span> : null}
    </button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => store.navigate({ page: 'quests' })} aria-label="TitanForge home">
          <BrandMark />
          <span className="brand-name">TitanForge</span>
        </button>
        <nav className="nav" aria-label="Main">
          {navItem('quests', 'Quest board', <ScrollText size={17} />)}
          {navItem('barracks', 'Barracks', <Castle size={17} />, store.heroes.length + store.champions.length)}
        </nav>
        <button
          type="button"
          className={`ledger-link ${section === 'ledger' ? 'is-active' : ''}`}
          onClick={() => store.navigate({ page: 'ledger' })}
          title="Backup, import, AI assistants and game data"
        >
          <BookOpen size={16} />
          <span>Ledger</span>
          <small>{data.metadata.officialSpreadsheetVersion.replace(/^client /, '').replace(/ \/ spreadsheet.*$/, '')}</small>
        </button>
      </header>

      <main className="main" id="main">
        {route.page === 'quests' && <QuestsView />}
        {route.page === 'barracks' && <BarracksView />}
        {route.page === 'hero' && <HeroSheet id={route.id} />}
        {route.page === 'champion' && <ChampionSheet id={route.id} />}
        {route.page === 'ledger' && <LedgerView />}
      </main>

      <footer className="footer">Fan project · not affiliated with or endorsed by Kabam · Shop Titans is a trademark of Kabam Games, Inc.</footer>
      <ToastHost />
    </div>
  );
}
