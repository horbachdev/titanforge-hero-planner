import { createPlannerApi, PlannerError, type ChampionBuildLike, type HeroBuildLike } from '../../shared/api/planner';
import type { GameRepository } from '../../shared/data/repository';
import type { BuildConfig, ChampionBuildConfig, RosterConfig } from '../../shared/types';
import { newTeam, normalizeChampionBuild, normalizeHeroBuild, normalizeTeam, type Library } from './storage';

/**
 * Import/export of the player's data. Accepts everything a player or an AI
 * assistant is likely to paste:
 *  - a TitanForge backup file,
 *  - single builds exported from the app,
 *  - the planner API's team format ({"heroes": [{"heroClass": "Mage", …}], "champion": {…}}),
 *    so builds suggested by an LLM can be pasted straight in.
 */

export const BACKUP_FORMAT = 'titanforge-backup';

export interface Backup extends Library {
  format: typeof BACKUP_FORMAT;
  version: 2;
  exportedAt: string;
  gameVersion: string;
}

export function createBackup(library: Library, gameVersion: string): Backup {
  return { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), gameVersion, ...library };
}

/** A team in the planner API format — what you would hand to an LLM. */
export function teamForAssistant(team: RosterConfig, library: Library) {
  return {
    name: team.name,
    heroes: team.heroBuildIds.map((id) => library.heroes.find((build) => build.id === id)).filter((build): build is BuildConfig => Boolean(build)),
    champion: library.champions.find((build) => build.id === team.championBuildId) ?? null
  };
}

export type ImportResult = { ok: true; library: Library; summary: string; notes: string[] } | { ok: false; error: string; suggestions: string[] };

export function parseImport(text: string, repo: GameRepository): ImportResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `That is not valid JSON: ${(error as Error).message}`, suggestions: [] };
  }

  try {
    const library = toLibrary(value, repo);
    const notes = library.notes;
    const total = library.heroes.length + library.champions.length + library.teams.length;
    if (total === 0) {
      return {
        ok: false,
        error: 'Nothing to import was found in this JSON.',
        suggestions: ['Paste a TitanForge backup, an exported build, or {"heroes": [...]}']
      };
    }
    return {
      ok: true,
      library: { heroes: library.heroes, champions: library.champions, teams: library.teams },
      summary: [
        plural(library.heroes.length, 'hero', 'heroes'),
        plural(library.champions.length, 'champion', 'champions'),
        plural(library.teams.length, 'team', 'teams')
      ]
        .filter(Boolean)
        .join(', '),
      notes
    };
  } catch (error) {
    if (error instanceof PlannerError) {
      return { ok: false, error: error.message, suggestions: error.suggestions };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error), suggestions: [] };
  }
}

function toLibrary(value: unknown, repo: GameRepository): Library & { notes: string[] } {
  const notes: string[] = [];
  const empty = { heroes: [] as BuildConfig[], champions: [] as ChampionBuildConfig[], teams: [] as RosterConfig[], notes };

  if (Array.isArray(value)) {
    const heroes = value.map((entry) => normalizeHeroBuild(entry, repo)).filter((entry): entry is BuildConfig => Boolean(entry));
    const champions = value.map((entry) => normalizeChampionBuild(entry, repo)).filter((entry): entry is ChampionBuildConfig => Boolean(entry));
    return { ...empty, heroes, champions };
  }
  if (!value || typeof value !== 'object') {
    return empty;
  }

  const object = value as Record<string, unknown>;

  if (object.format === BACKUP_FORMAT || (Array.isArray(object.teams) && Array.isArray(object.heroes) && isBuildArray(object.heroes))) {
    return {
      heroes: asArray(object.heroes)
        .map((entry) => normalizeHeroBuild(entry, repo))
        .filter((entry): entry is BuildConfig => Boolean(entry)),
      champions: asArray(object.champions)
        .map((entry) => normalizeChampionBuild(entry, repo))
        .filter((entry): entry is ChampionBuildConfig => Boolean(entry)),
      teams: asArray(object.teams)
        .map(normalizeTeam)
        .filter((entry): entry is RosterConfig => Boolean(entry)),
      notes
    };
  }

  if (object.schemaVersion === 1 && 'heroClassId' in object) {
    const hero = normalizeHeroBuild(object, repo);
    return { ...empty, heroes: hero ? [hero] : [] };
  }
  if (object.schemaVersion === 1 && 'championId' in object) {
    const champion = normalizeChampionBuild(object, repo);
    return { ...empty, champions: champion ? [champion] : [] };
  }

  // Planner API / LLM formats.
  const api = createPlannerApi(repo);
  if (typeof object.heroClass === 'string') {
    const result = api.evaluateHero(object as unknown as HeroBuildLike);
    return { ...empty, heroes: [result.build], notes: result.notes };
  }
  if (Array.isArray(object.heroes)) {
    const heroes = (object.heroes as HeroBuildLike[]).slice(0, 5).map((hero) => {
      const result = api.evaluateHero(hero);
      notes.push(...result.notes);
      return result.build;
    });
    const champion = object.champion ? api.evaluateChampion(object.champion as ChampionBuildLike) : null;
    if (champion) {
      notes.push(...champion.notes);
    }
    const team = newTeam(typeof object.name === 'string' && object.name ? object.name : 'Imported team');
    team.heroBuildIds = [...heroes.map((hero) => hero.id), null, null, null, null, null].slice(0, 5);
    team.championBuildId = champion?.build.id ?? '';
    return { heroes, champions: champion ? [champion.build] : [], teams: [team], notes };
  }
  if (typeof object.champion === 'string') {
    const result = api.evaluateChampion(object as unknown as ChampionBuildLike);
    return { ...empty, champions: [result.build], notes: result.notes };
  }
  return empty;
}

function isBuildArray(value: unknown[]): boolean {
  return value.every((entry) => entry && typeof entry === 'object' && 'heroClassId' in (entry as object));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function plural(count: number, one: string, many: string): string {
  return count === 0 ? '' : `${count} ${count === 1 ? one : many}`;
}
