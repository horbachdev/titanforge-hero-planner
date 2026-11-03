import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GameRepository } from '../../shared/data/repository';
import { loadGameData, type GameDataSource, type LoadedGameData } from '../../shared/data/source';
import type { GameData } from '../../shared/types';

interface GameContextValue {
  data: GameData;
  repo: GameRepository;
  loaded: LoadedGameData;
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * Loads game data from the injected source once and provides it to the app.
 * The UI never imports the JSON directly, so swapping the source (remote
 * file, official API, test fixture) needs no UI change.
 */
export function GameDataProvider({ source, children }: { source: GameDataSource; children: ReactNode }): JSX.Element {
  const [state, setState] = useState<{ loaded?: LoadedGameData; error?: string }>({});

  useEffect(() => {
    const controller = new AbortController();
    loadGameData(source, controller.signal)
      .then((loaded) => setState({ loaded }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ error: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => controller.abort();
  }, [source]);

  const value = useMemo(
    () => (state.loaded ? { data: state.loaded.data, repo: new GameRepository(state.loaded.data), loaded: state.loaded } : null),
    [state.loaded]
  );

  if (state.error) {
    return (
      <div className="boot-screen" role="alert">
        <h1>Game data could not be loaded</h1>
        <p>{state.error}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="boot-screen" aria-busy="true">
        <div className="boot-spinner" />
        <p>Loading game data…</p>
      </div>
    );
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) {
    throw new Error('useGame must be used inside <GameDataProvider>.');
  }
  return value;
}
