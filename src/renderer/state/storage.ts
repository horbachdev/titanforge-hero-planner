import { parseBuildJsonDetailed } from '../../shared/build-io';
import { createId, defaultChampionBuild, ITEM_QUALITIES, normalizeEquipmentForHero } from '../../shared/data-utils';
import type { GameRepository } from '../../shared/data/repository';
import { getChampionMaxRank } from '../../shared/engine';
import { TEAM_HERO_SLOTS } from '../../shared/team';
import type { BuildConfig, ChampionBuildConfig, EquipmentSelection, RosterConfig } from '../../shared/types';

/**
 * Persistence for the player's own data (builds, champions, teams).
 *
 * Storage keys are unchanged from v0.1 so existing players keep everything.
 * The only migration: v0.1 kept a separate unsaved "current build" draft next
 * to the library. v0.2 edits library entries directly, so a meaningful draft
 * is moved into the library once instead of being lost.
 */

export const STORAGE_KEYS = {
  heroes: 'shopTitansHeroBuilder.savedBuilds',
  champions: 'shopTitansHeroBuilder.savedChampions',
  teams: 'shopTitansHeroBuilder.rosters',
  activeTeam: 'shopTitansHeroBuilder.activeRoster',
  legacyHeroDraft: 'shopTitansHeroBuilder.currentBuild',
  legacyChampionDraft: 'shopTitansHeroBuilder.championBuild',
  prefs: 'titanforge.prefs'
} as const;

export interface Library {
  heroes: BuildConfig[];
  champions: ChampionBuildConfig[];
  teams: RosterConfig[];
}

export interface LoadReport {
  library: Library;
  /** Human readable notes about what was migrated or repaired. */
  notes: string[];
}

export function loadLibrary(repo: GameRepository, storage: Storage | undefined = safeStorage()): LoadReport {
  const notes: string[] = [];
  const heroes = readArray(storage, STORAGE_KEYS.heroes)
    .map((entry) => normalizeHeroBuild(entry, repo))
    .filter((entry): entry is BuildConfig => Boolean(entry));
  const champions = readArray(storage, STORAGE_KEYS.champions)
    .map((entry) => normalizeChampionBuild(entry, repo))
    .filter((entry): entry is ChampionBuildConfig => Boolean(entry));
  const teams = readArray(storage, STORAGE_KEYS.teams)
    .map((entry) => normalizeTeam(entry))
    .filter((entry): entry is RosterConfig => Boolean(entry));

  const heroDraft = normalizeHeroBuild(readJson(storage, STORAGE_KEYS.legacyHeroDraft), repo);
  if (heroDraft && !heroes.some((entry) => entry.id === heroDraft.id) && isMeaningfulHeroDraft(heroDraft)) {
    heroes.push({ ...heroDraft, name: `${heroDraft.name} (recovered draft)` });
    notes.push(`Recovered your unsaved hero "${heroDraft.name}" into the hero list.`);
  }
  const championDraft = normalizeChampionBuild(readJson(storage, STORAGE_KEYS.legacyChampionDraft), repo);
  if (championDraft && !champions.some((entry) => entry.id === championDraft.id) && isMeaningfulChampionDraft(championDraft)) {
    champions.push({ ...championDraft, name: `${championDraft.name} (recovered draft)` });
    notes.push(`Recovered your unsaved champion "${championDraft.name}" into the champion list.`);
  }
  storage?.removeItem(STORAGE_KEYS.legacyHeroDraft);
  storage?.removeItem(STORAGE_KEYS.legacyChampionDraft);

  return { library: { heroes, champions, teams: teams.length > 0 ? teams : [] }, notes };
}

export function saveLibraryPart(key: keyof Library, value: unknown, storage: Storage | undefined = safeStorage()): void {
  const storageKey = { heroes: STORAGE_KEYS.heroes, champions: STORAGE_KEYS.champions, teams: STORAGE_KEYS.teams }[key];
  try {
    storage?.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: the app keeps working in memory.
  }
}

export function readPrefs<T>(fallback: T, storage: Storage | undefined = safeStorage()): T {
  const stored = readJson(storage, STORAGE_KEYS.prefs);
  return stored && typeof stored === 'object' ? { ...fallback, ...(stored as Partial<T>) } : fallback;
}

export function writePrefs(prefs: unknown, storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEYS.prefs, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Normalization (also used for imports)
// ---------------------------------------------------------------------------

export function normalizeHeroBuild(value: unknown, repo: GameRepository): BuildConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const parsed = parseBuildJsonDetailed(JSON.stringify(value), repo.data);
  if (!parsed.ok) {
    return null;
  }
  const build = parsed.build;
  const base = repo.hero(repo.canonicalId('hero', build.heroClassId));
  const heroClassId = base ? (base.promoted ? base.baseClassId : base.id) : build.heroClassId;
  const effective = base && build.promoted && base.promotedClassId ? (repo.hero(base.promotedClassId) ?? base) : base;
  const canonical: BuildConfig = {
    ...build,
    heroClassId,
    level: clampInt(build.level, 1, 50),
    seeds: {
      attack: clampInt(build.seeds?.attack ?? 0, 0, 999),
      defense: clampInt(build.seeds?.defense ?? 0, 0, 999),
      hp: clampInt(build.seeds?.hp ?? 0, 0, 999)
    },
    skills: [...(build.skills ?? []).map((id) => (id ? repo.canonicalId('skill', id) : '')), '', '', '', ''].slice(0, 4),
    equipment: build.equipment.map((entry) => normalizeSelection(entry, entry.slotId, repo))
  };
  return effective ? { ...canonical, equipment: normalizeEquipmentForHero(canonical, effective) } : canonical;
}

export function normalizeChampionBuild(value: unknown, repo: GameRepository): ChampionBuildConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const fallback = defaultChampionBuild(repo.data);
  const candidate = value as Partial<ChampionBuildConfig>;
  const champion = repo.champion(candidate.championId ?? '');
  if (!champion) {
    return null;
  }
  const maxRank = getChampionMaxRank(champion);
  return {
    schemaVersion: 1,
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createId('champion'),
    name: typeof candidate.name === 'string' ? candidate.name : champion.name,
    championId: champion.id,
    rank: clampInt(Number(candidate.rank ?? maxRank), 1, maxRank),
    level: clampInt(Number(candidate.level ?? fallback.level), 1, 50),
    powerUps: clampInt(Number(candidate.powerUps ?? 0), 0, 999),
    championSoul: Boolean(candidate.championSoul ?? fallback.championSoul),
    seeds: {
      attack: clampInt(Number(candidate.seeds?.attack ?? 0), 0, 999),
      defense: clampInt(Number(candidate.seeds?.defense ?? 0), 0, 999),
      hp: clampInt(Number(candidate.seeds?.hp ?? 0), 0, 999)
    },
    familiar: normalizeSelection(candidate.familiar, 'familiar', repo),
    aurasong: normalizeSelection(candidate.aurasong, 'aurasong', repo)
  };
}

export function normalizeTeam(value: unknown): RosterConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RosterConfig> & { builds?: Array<{ id?: string } | null> };
  const ids = Array.isArray(candidate.heroBuildIds) ? candidate.heroBuildIds : (candidate.builds ?? []).map((entry) => entry?.id ?? null);
  return {
    schemaVersion: 1,
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createId('roster'),
    name: typeof candidate.name === 'string' && candidate.name ? candidate.name : 'Team',
    heroBuildIds: Array.from({ length: TEAM_HERO_SLOTS }, (_, index) => {
      const id = ids[index];
      return typeof id === 'string' && id ? id : null;
    }),
    championBuildId: typeof candidate.championBuildId === 'string' ? candidate.championBuildId : ''
  };
}

export function newTeam(name: string): RosterConfig {
  return {
    schemaVersion: 1,
    id: createId('roster'),
    name,
    heroBuildIds: Array.from({ length: TEAM_HERO_SLOTS }, () => null),
    championBuildId: ''
  };
}

function normalizeSelection(value: unknown, slotId: string, repo: GameRepository): EquipmentSelection {
  const candidate = value && typeof value === 'object' ? (value as Partial<EquipmentSelection>) : {};
  return {
    slotId,
    itemId: typeof candidate.itemId === 'string' && candidate.itemId ? repo.canonicalId('item', candidate.itemId) : '',
    quality: ITEM_QUALITIES.includes(candidate.quality as never) ? (candidate.quality as EquipmentSelection['quality']) : 'normal',
    elementId: typeof candidate.elementId === 'string' ? candidate.elementId : '',
    spiritId: typeof candidate.spiritId === 'string' ? candidate.spiritId : '',
    starforged: Boolean(candidate.starforged)
  };
}

function isMeaningfulHeroDraft(build: BuildConfig): boolean {
  return build.name !== 'New Build' || build.equipment.some((entry) => entry.itemId) || build.skills.some(Boolean);
}

function isMeaningfulChampionDraft(build: ChampionBuildConfig): boolean {
  return Boolean(build.familiar.itemId || build.aurasong.itemId || !/^Champion \d+$/.test(build.name));
}

function readArray(storage: Storage | undefined, key: string): unknown[] {
  const value = readJson(storage, key);
  return Array.isArray(value) ? value : [];
}

function readJson(storage: Storage | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function clampInt(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}
