import type { ChampionData, EnchantmentData, GameData, GameDataAliases, HeroData, ItemData, QuestData, SkillData } from '../types';

export type EntityKind = 'hero' | 'item' | 'skill' | 'champion' | 'enchantment' | 'quest';

interface EntityMap {
  hero: HeroData;
  item: ItemData;
  skill: SkillData;
  champion: ChampionData;
  enchantment: EnchantmentData;
  quest: QuestData;
}

const ALIAS_KEYS: Record<EntityKind, keyof GameDataAliases | undefined> = {
  hero: 'heroes',
  item: 'items',
  skill: 'skills',
  champion: 'champions',
  enchantment: undefined,
  quest: 'quests'
};

export interface ResolveMatch<T> {
  entity: T;
  /** How the input matched. Anything but "id"/"name" is worth reporting back. */
  matchedBy: 'id' | 'alias' | 'name' | 'normalized' | 'partial';
}

export interface ResolveFailure {
  entity: null;
  suggestions: string[];
  ambiguous: boolean;
}

/**
 * Read-only, indexed view on a `GameData` bundle.
 *
 * The engine still accepts plain `GameData` (kept stable on purpose); the
 * repository adds O(1) lookups, alias resolution for renamed entities and
 * forgiving name search for search boxes and the LLM interface.
 */
export class GameRepository {
  readonly data: GameData;
  private readonly indexes: { [K in EntityKind]: Map<string, EntityMap[K]> };
  private readonly sortedLevels: GameData['heroLevels'];

  constructor(data: GameData) {
    this.data = data;
    this.indexes = {
      hero: byId(data.heroes),
      item: byId(data.items),
      skill: byId(data.skills),
      champion: byId(data.champions),
      enchantment: byId(data.enchantments),
      quest: byId(data.quests)
    };
    this.sortedLevels = [...data.heroLevels].sort((left, right) => left.level - right.level);
  }

  get version(): string {
    return this.data.metadata.officialSpreadsheetVersion;
  }

  list<K extends EntityKind>(kind: K): Array<EntityMap[K]> {
    return [...this.indexes[kind].values()];
  }

  /** Exact id lookup, following aliases for renamed entities. */
  get<K extends EntityKind>(kind: K, id: string | null | undefined): EntityMap[K] | undefined {
    if (!id) {
      return undefined;
    }
    return this.indexes[kind].get(id) ?? this.indexes[kind].get(this.canonicalId(kind, id));
  }

  /** Maps an outdated id to its current id (or returns it unchanged). */
  canonicalId(kind: EntityKind, id: string): string {
    const key = ALIAS_KEYS[kind];
    const alias = key ? this.data.aliases?.[key]?.[id] : undefined;
    return alias ?? id;
  }

  hero(id: string | null | undefined): HeroData | undefined {
    return this.get('hero', id);
  }

  item(id: string | null | undefined): ItemData | undefined {
    return this.get('item', id);
  }

  skill(id: string | null | undefined): SkillData | undefined {
    return this.get('skill', id);
  }

  champion(id: string | null | undefined): ChampionData | undefined {
    return this.get('champion', id);
  }

  enchantment(id: string | null | undefined): EnchantmentData | undefined {
    return this.get('enchantment', id);
  }

  quest(id: string | null | undefined): QuestData | undefined {
    return this.get('quest', id);
  }

  baseHeroes(): HeroData[] {
    return this.data.heroes.filter((hero) => !hero.promoted);
  }

  maxTierForLevel(level: number): number {
    let maxTier = this.sortedLevels[0]?.maxItemTier ?? 1;
    for (const row of this.sortedLevels) {
      if (row.level <= level) {
        maxTier = row.maxItemTier;
      }
    }
    return maxTier;
  }

  /**
   * Resolves user/LLM input ("kiku ichimonji", "Kiku-Ichimonji", an id…) to
   * one entity. Never guesses between several equally good matches: an
   * ambiguous input returns suggestions instead.
   */
  resolve<K extends EntityKind>(kind: K, input: string, filter?: (entity: EntityMap[K]) => boolean): ResolveMatch<EntityMap[K]> | ResolveFailure {
    const query = input.trim();
    const accept = (entity: EntityMap[K] | undefined): entity is EntityMap[K] => Boolean(entity && (!filter || filter(entity)));

    const byExactId = this.indexes[kind].get(query);
    if (accept(byExactId)) {
      return { entity: byExactId, matchedBy: 'id' };
    }
    const byAlias = this.indexes[kind].get(this.canonicalId(kind, query));
    if (accept(byAlias)) {
      return { entity: byAlias, matchedBy: 'alias' };
    }

    const candidates = this.list(kind).filter((entity) => !filter || filter(entity));
    const lower = query.toLowerCase();
    const exactName = candidates.filter((entity) => displayName(kind, entity).toLowerCase() === lower);
    if (exactName.length === 1) {
      return { entity: exactName[0], matchedBy: 'name' };
    }

    const normalizedQuery = normalizeSearch(query);
    const normalized = candidates.filter((entity) => normalizeSearch(displayName(kind, entity)) === normalizedQuery);
    if (normalized.length === 1) {
      return { entity: normalized[0], matchedBy: 'normalized' };
    }

    const partial = normalizedQuery ? candidates.filter((entity) => normalizeSearch(searchText(kind, entity)).includes(normalizedQuery)) : [];
    if (partial.length === 1) {
      return { entity: partial[0], matchedBy: 'partial' };
    }

    const ambiguousPool = exactName.length > 1 ? exactName : normalized.length > 1 ? normalized : partial;
    const pool = ambiguousPool.length > 1 ? ambiguousPool : this.search(kind, query, { limit: 5, filter });
    return {
      entity: null,
      ambiguous: ambiguousPool.length > 1,
      suggestions: pool.slice(0, 8).map((entity) => describeShort(kind, entity))
    };
  }

  /** Ranked fuzzy search (prefix > word start > substring > subsequence). */
  search<K extends EntityKind>(
    kind: K,
    query: string,
    options: { limit?: number; filter?: (entity: EntityMap[K]) => boolean } = {}
  ): Array<EntityMap[K]> {
    const normalizedQuery = normalizeSearch(query);
    const pool = this.list(kind).filter((entity) => !options.filter || options.filter(entity));
    if (!normalizedQuery) {
      return pool.slice(0, options.limit ?? pool.length);
    }
    return pool
      .map((entity) => ({
        entity,
        score: matchScore(normalizeSearch(searchText(kind, entity)), normalizeSearch(displayName(kind, entity)), normalizedQuery)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || displayName(kind, left.entity).localeCompare(displayName(kind, right.entity)))
      .slice(0, options.limit ?? 50)
      .map((entry) => entry.entity);
  }
}

export function displayName(kind: EntityKind, entity: EntityMap[EntityKind]): string {
  if (kind === 'quest') {
    return questDisplayName(entity as QuestData);
  }
  return (entity as { name: string }).name;
}

export function questDisplayName(quest: QuestData): string {
  return `${quest.zone} (${quest.type}, ${quest.difficulty})`;
}

function searchText(kind: EntityKind, entity: EntityMap[EntityKind]): string {
  if (kind === 'item') {
    const item = entity as ItemData;
    return `${item.name} ${item.type}`;
  }
  if (kind === 'hero') {
    const hero = entity as HeroData;
    return `${hero.name} ${hero.baseClassName}`;
  }
  return displayName(kind, entity);
}

function describeShort(kind: EntityKind, entity: EntityMap[EntityKind]): string {
  if (kind === 'item') {
    const item = entity as ItemData;
    return `${item.name} (T${item.tier} ${item.type}, id: ${item.id})`;
  }
  return `${displayName(kind, entity)} (id: ${(entity as { id: string }).id})`;
}

export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchScore(haystack: string, name: string, query: string): number {
  if (name === query) {
    return 100;
  }
  if (name.startsWith(query)) {
    return 80;
  }
  if (` ${haystack}`.includes(` ${query}`)) {
    return 60;
  }
  if (haystack.includes(query)) {
    return 40;
  }
  const tokens = query.split(' ');
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
    return 30;
  }
  return isSubsequence(query.replace(/ /g, ''), haystack.replace(/ /g, '')) ? 10 : 0;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) {
        return true;
      }
    }
  }
  return needle.length === 0;
}

function byId<T extends { id: string }>(entries: T[]): Map<string, T> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}
