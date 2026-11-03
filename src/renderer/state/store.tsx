import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createId, defaultChampionBuild, emptyEquipmentForHero } from '../../shared/data-utils';
import type { RessMiniBossModifier } from '../../shared/combat-engine';
import { DEFAULT_SIMULATION_RUNS } from '../../shared/team';
import type { BuildConfig, ChampionBuildConfig, RosterConfig } from '../../shared/types';
import { useGame } from '../data/GameDataContext';
import { loadLibrary, newTeam, readPrefs, saveLibraryPart, STORAGE_KEYS, writePrefs, type Library } from './storage';

export type Route = { page: 'quests' } | { page: 'barracks' } | { page: 'ledger' } | { page: 'hero'; id: string } | { page: 'champion'; id: string };

export interface Prefs {
  route: Route;
  teamId: string;
  sim: {
    zoneKey: string;
    questId: string;
    miniBoss: RessMiniBossModifier;
    runs: number;
    defenseCaps: Record<string, number>;
  };
}

export interface Toast {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'warning';
  action?: { label: string; run: () => void };
}

interface StoreValue extends Library {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs> | ((current: Prefs) => Partial<Prefs>)) => void;
  navigate: (route: Route) => void;
  goBack: () => void;

  createHero: (heroClassId?: string) => BuildConfig;
  updateHero: (id: string, updater: (build: BuildConfig) => BuildConfig) => void;
  duplicateHero: (id: string) => void;
  deleteHero: (id: string) => void;

  createChampion: (championId?: string) => ChampionBuildConfig;
  updateChampion: (id: string, updater: (build: ChampionBuildConfig) => ChampionBuildConfig) => void;
  duplicateChampion: (id: string) => void;
  deleteChampion: (id: string) => void;

  createTeam: () => RosterConfig;
  updateTeam: (id: string, updater: (team: RosterConfig) => RosterConfig) => void;
  duplicateTeam: (id: string) => void;
  deleteTeam: (id: string) => void;

  importLibrary: (incoming: Partial<Library>) => void;

  toasts: Toast[];
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const { data, repo } = useGame();
  const initial = useMemo(() => loadLibrary(repo), [repo]);
  const [heroes, setHeroes] = useState(initial.library.heroes);
  const [champions, setChampions] = useState(initial.library.champions);
  const [teams, setTeams] = useState(() => (initial.library.teams.length > 0 ? initial.library.teams : [newTeam('Main Team')]));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(() => {
    const legacyTeam = safeGet(STORAGE_KEYS.activeTeam) ?? '';
    const stored = readPrefs<Prefs>({
      route: { page: initial.library.heroes.length > 0 ? 'quests' : 'barracks' },
      teamId: legacyTeam,
      sim: { zoneKey: '', questId: '', miniBoss: 'None', runs: DEFAULT_SIMULATION_RUNS, defenseCaps: {} }
    });
    const route = routeFromHash() ?? (isRoute(stored.route) ? stored.route : { page: 'barracks' as const });
    return { ...stored, route };
  });

  // Persist each slice only when it actually changes.
  useEffect(() => saveLibraryPart('heroes', heroes), [heroes]);
  useEffect(() => saveLibraryPart('champions', champions), [champions]);
  useEffect(() => saveLibraryPart('teams', teams), [teams]);
  useEffect(() => {
    writePrefs(prefs);
    if (prefs.teamId) {
      safeSet(STORAGE_KEYS.activeTeam, prefs.teamId);
    }
  }, [prefs]);

  // Keep the URL hash in sync so browser back/forward and reloads work.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const hash = routeToHash(prefs.route);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
    const onHashChange = () => {
      const route = routeFromHash();
      if (route) {
        setPrefsState((current) => (routeToHash(current.route) === routeToHash(route) ? current : { ...current, route }));
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, [prefs.route]);

  const notify = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = createId('toast');
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), toast.action ? 7000 : 3500);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((current) => current.filter((entry) => entry.id !== id)), []);

  const migrationNotified = useRef(false);
  useEffect(() => {
    if (migrationNotified.current) {
      return;
    }
    migrationNotified.current = true;
    for (const note of initial.notes) {
      notify({ message: note, tone: 'info' });
    }
  }, [initial, notify]);

  const setPrefs = useCallback<StoreValue['setPrefs']>((patch) => {
    setPrefsState((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  }, []);

  const navigate = useCallback((route: Route) => {
    setPrefsState((current) => ({ ...current, route }));
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', routeToHash(route));
      window.scrollTo?.({ top: 0 });
    }
  }, []);

  const goBack = useCallback(() => {
    setPrefsState((current) => ({
      ...current,
      route: { page: current.route.page === 'champion' || current.route.page === 'hero' ? 'barracks' : 'quests' }
    }));
  }, []);

  // Refs let callbacks read the latest lists without re-creating themselves.
  const latest = useRef({ heroes, champions, teams });
  latest.current = { heroes, champions, teams };

  const value = useMemo<StoreValue>(() => {
    function createHero(heroClassId?: string): BuildConfig {
      const hero = repo.hero(heroClassId) ?? repo.baseHeroes()[0];
      const count = latest.current.heroes.filter((entry) => entry.heroClassId === hero.id).length;
      const build: BuildConfig = {
        schemaVersion: 1,
        id: createId('build'),
        name: count > 0 ? `${hero.name} ${count + 1}` : hero.name,
        heroClassId: hero.id,
        promoted: false,
        level: 40,
        seeds: { attack: 0, defense: 0, hp: 0 },
        skills: ['', '', '', ''],
        equipment: emptyEquipmentForHero(hero)
      };
      setHeroes((current) => [...current, build]);
      return build;
    }

    function createChampion(championId?: string): ChampionBuildConfig {
      const base = defaultChampionBuild(data);
      const champion = repo.champion(championId) ?? repo.champion(base.championId);
      const build: ChampionBuildConfig = {
        ...base,
        id: createId('champion'),
        championId: champion?.id ?? base.championId,
        name: champion?.name ?? base.name
      };
      setChampions((current) => [...current, build]);
      return build;
    }

    function createTeam(): RosterConfig {
      const team = newTeam(`Team ${latest.current.teams.length + 1}`);
      setTeams((current) => [...current, team]);
      setPrefsState((current) => ({ ...current, teamId: team.id }));
      return team;
    }

    function removeWithUndo<T extends { id: string; name: string }>(
      list: T[],
      setList: (updater: (current: T[]) => T[]) => void,
      id: string,
      label: string,
      detachFromTeams: (team: RosterConfig) => RosterConfig,
      reattach: (before: RosterConfig[]) => void
    ): void {
      const index = list.findIndex((entry) => entry.id === id);
      const entity = list[index];
      if (!entity) {
        return;
      }
      const teamsBefore = latest.current.teams;
      setList((current) => current.filter((entry) => entry.id !== id));
      setTeams((current) => current.map(detachFromTeams));
      notify({
        message: `Deleted ${label} “${entity.name}”.`,
        action: {
          label: 'Undo',
          run: () => {
            setList((current) =>
              current.some((entry) => entry.id === id) ? current : [...current.slice(0, index), entity, ...current.slice(index)]
            );
            reattach(teamsBefore);
          }
        }
      });
    }

    return {
      heroes,
      champions,
      teams,
      prefs,
      setPrefs,
      navigate,
      goBack,
      toasts,
      notify,
      dismissToast,

      createHero,
      updateHero: (id, updater) => setHeroes((current) => current.map((entry) => (entry.id === id ? updater(entry) : entry))),
      duplicateHero: (id) => {
        const source = latest.current.heroes.find((entry) => entry.id === id);
        if (!source) {
          return;
        }
        const copy = { ...structuredCloneSafe(source), id: createId('build'), name: `${source.name} copy` };
        setHeroes((current) => [...current, copy]);
        navigate({ page: 'hero', id: copy.id });
        notify({ message: `Created “${copy.name}”. Changes to it won't affect the original.`, tone: 'success' });
      },
      deleteHero: (id) =>
        removeWithUndo(
          latest.current.heroes,
          setHeroes,
          id,
          'hero',
          (team) => ({ ...team, heroBuildIds: team.heroBuildIds.map((entry) => (entry === id ? null : entry)) }),
          (before) =>
            setTeams((current) =>
              current.map((team) => {
                const old = before.find((entry) => entry.id === team.id);
                return old
                  ? { ...team, heroBuildIds: team.heroBuildIds.map((entry, slot) => (entry === null && old.heroBuildIds[slot] === id ? id : entry)) }
                  : team;
              })
            )
        ),

      createChampion,
      updateChampion: (id, updater) => setChampions((current) => current.map((entry) => (entry.id === id ? updater(entry) : entry))),
      duplicateChampion: (id) => {
        const source = latest.current.champions.find((entry) => entry.id === id);
        if (!source) {
          return;
        }
        const copy = { ...structuredCloneSafe(source), id: createId('champion'), name: `${source.name} copy` };
        setChampions((current) => [...current, copy]);
        navigate({ page: 'champion', id: copy.id });
      },
      deleteChampion: (id) =>
        removeWithUndo(
          latest.current.champions,
          setChampions,
          id,
          'champion',
          (team) => (team.championBuildId === id ? { ...team, championBuildId: '' } : team),
          (before) =>
            setTeams((current) =>
              current.map((team) => {
                const old = before.find((entry) => entry.id === team.id);
                return old?.championBuildId === id && !team.championBuildId ? { ...team, championBuildId: id } : team;
              })
            )
        ),

      createTeam,
      updateTeam: (id, updater) => setTeams((current) => current.map((entry) => (entry.id === id ? updater(entry) : entry))),
      duplicateTeam: (id) => {
        const source = latest.current.teams.find((entry) => entry.id === id);
        if (!source) {
          return;
        }
        const copy = { ...source, heroBuildIds: [...source.heroBuildIds], id: createId('roster'), name: `${source.name} copy` };
        setTeams((current) => [...current, copy]);
        setPrefsState((current) => ({ ...current, teamId: copy.id }));
      },
      deleteTeam: (id) => {
        const index = latest.current.teams.findIndex((entry) => entry.id === id);
        const team = latest.current.teams[index];
        if (!team) {
          return;
        }
        setTeams((current) => {
          const remaining = current.filter((entry) => entry.id !== id);
          return remaining.length > 0 ? remaining : [newTeam('Main Team')];
        });
        notify({
          message: `Deleted team “${team.name}”. Its heroes are still in your hero list.`,
          action: {
            label: 'Undo',
            run: () => setTeams((current) => [...current.slice(0, index), team, ...current.slice(index)])
          }
        });
      },

      importLibrary: (incoming) => {
        const merge = <T extends { id: string }>(current: T[], next: T[] = []) => {
          const ids = new Set(current.map((entry) => entry.id));
          return [...current, ...next.map((entry) => (ids.has(entry.id) ? { ...entry, id: createId('import') } : entry))];
        };
        setHeroes((current) => merge(current, incoming.heroes));
        setChampions((current) => merge(current, incoming.champions));
        setTeams((current) => merge(current, incoming.teams));
      }
    };
  }, [heroes, champions, teams, prefs, toasts, data, repo, notify, dismissToast, setPrefs, navigate, goBack]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) {
    throw new Error('useStore must be used inside <StoreProvider>.');
  }
  return value;
}

export function routeToHash(route: Route): string {
  return route.page === 'hero' || route.page === 'champion' ? `#/${route.page}/${encodeURIComponent(route.id)}` : `#/${route.page}`;
}

function routeFromHash(): Route | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const [page, id] = window.location.hash.replace(/^#\/?/, '').split('/');
  if ((page === 'hero' || page === 'champion') && id) {
    return { page, id: decodeURIComponent(id) };
  }
  // v0.2 tab names map onto the new pages.
  const legacy: Record<string, Route['page']> = { simulate: 'quests', teams: 'quests', heroes: 'barracks', champions: 'barracks', data: 'ledger' };
  const resolved = page === 'quests' || page === 'barracks' || page === 'ledger' ? page : legacy[page];
  return resolved ? ({ page: resolved } as Route) : null;
}

function isRoute(value: unknown): value is Route {
  return Boolean(value && typeof value === 'object' && typeof (value as Route).page === 'string');
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
