import type { GameData } from '../types';

/**
 * Structural + referential checks for a game data bundle.
 *
 * Used in three places so that broken data never reaches a player:
 *  - the importer refuses to write a bundle with errors,
 *  - remote/API data sources reject invalid payloads and fall back,
 *  - tests pin the bundled data to the same rules.
 */

export interface DataValidationIssue {
  path: string;
  message: string;
}

export interface DataValidationReport {
  ok: boolean;
  errors: DataValidationIssue[];
  warnings: DataValidationIssue[];
  counts: Record<CollectionKey, number>;
}

const COLLECTIONS = ['heroes', 'heroLevels', 'items', 'skills', 'champions', 'enchantments', 'quests'] as const;
type CollectionKey = (typeof COLLECTIONS)[number];

/**
 * Lower bounds for a complete export of the official spreadsheet. A sudden drop
 * below these almost always means the upstream sheet layout changed and the
 * importer silently parsed garbage (this happened with client v26.9.1).
 */
export const MINIMUM_COUNTS: Record<CollectionKey, number> = {
  heroes: 30,
  heroLevels: 40,
  items: 1000,
  skills: 400,
  champions: 10,
  enchantments: 40,
  quests: 150
};

export function validateGameData(value: unknown): DataValidationReport {
  const errors: DataValidationIssue[] = [];
  const warnings: DataValidationIssue[] = [];
  const counts = Object.fromEntries(COLLECTIONS.map((key) => [key, 0])) as Record<CollectionKey, number>;

  if (!value || typeof value !== 'object') {
    return { ok: false, errors: [{ path: '$', message: 'Game data must be a JSON object.' }], warnings, counts };
  }

  const candidate = value as Partial<Record<string, unknown>>;
  const metadata = candidate.metadata as Partial<GameData['metadata']> | undefined;
  if (!metadata || typeof metadata !== 'object') {
    errors.push({ path: 'metadata', message: 'Missing metadata block.' });
  } else if (typeof metadata.officialSpreadsheetVersion !== 'string' || !metadata.officialSpreadsheetVersion) {
    errors.push({ path: 'metadata.officialSpreadsheetVersion', message: 'Missing source version.' });
  } else if (metadata.officialSpreadsheetVersion === 'unknown') {
    warnings.push({ path: 'metadata.officialSpreadsheetVersion', message: 'Source version could not be detected.' });
  }

  for (const key of COLLECTIONS) {
    const collection = candidate[key];
    if (!Array.isArray(collection)) {
      errors.push({ path: key, message: `Expected "${key}" to be an array.` });
      continue;
    }
    counts[key] = collection.length;
    if (collection.length < MINIMUM_COUNTS[key]) {
      errors.push({
        path: key,
        message: `Only ${collection.length} ${key} found (expected at least ${MINIMUM_COUNTS[key]}). The source layout probably changed.`
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, counts };
  }

  const data = value as GameData;
  checkUniqueIds(data.heroes, 'heroes', errors);
  checkUniqueIds(data.items, 'items', errors);
  checkUniqueIds(data.skills, 'skills', errors);
  checkUniqueIds(data.champions, 'champions', errors);
  checkUniqueIds(data.enchantments, 'enchantments', errors);
  checkUniqueIds(data.quests, 'quests', errors);

  const heroIds = new Set(data.heroes.map((hero) => hero.id));
  const skillIds = new Set(data.skills.map((skill) => skill.id));
  const itemTypes = new Set(data.items.map((item) => item.type));

  for (const hero of data.heroes) {
    const path = `heroes.${hero.id}`;
    if (!hero.name) {
      errors.push({ path, message: 'Hero without a name.' });
    }
    if (hero.slots.length !== 6) {
      errors.push({ path, message: `Expected 6 equipment slots, found ${hero.slots.length}.` });
    }
    hero.slots.forEach((slot, index) => {
      if (slot.allowedTypes.length === 0) {
        errors.push({ path: `${path}.slots.${index}`, message: 'Slot allows no item types.' });
      }
      for (const type of slot.allowedTypes) {
        if (!itemTypes.has(type)) {
          warnings.push({ path: `${path}.slots.${index}`, message: `Slot allows "${type}" but no item of that type exists.` });
        }
      }
    });
    if (hero.baseStats.hp <= 0 || hero.baseStats.attack <= 0) {
      errors.push({ path, message: 'Hero base HP/ATK must be positive.' });
    }
    if (hero.promotedClassId && !heroIds.has(hero.promotedClassId)) {
      errors.push({ path, message: `Promotion "${hero.promotedClassId}" does not exist.` });
    }
    if (!heroIds.has(hero.baseClassId)) {
      errors.push({ path, message: `Base class "${hero.baseClassId}" does not exist.` });
    }
    for (const skillId of hero.innateSkillIds) {
      if (!skillIds.has(skillId)) {
        errors.push({ path, message: `Innate skill "${skillId}" does not exist.` });
      }
    }
    if (hero.innateSkillIds.length === 0) {
      warnings.push({ path, message: 'No innate skill linked.' });
    }
  }

  for (const champion of data.champions) {
    const path = `champions.${champion.id}`;
    if (champion.rankRewards.length === 0) {
      errors.push({ path, message: 'Champion has no rank rewards.' });
    }
    for (const reward of champion.rankRewards) {
      if (reward.leaderSkillId && !skillIds.has(reward.leaderSkillId)) {
        errors.push({ path, message: `Leader skill "${reward.leaderSkillId}" does not exist.` });
      }
    }
  }

  for (const quest of data.quests) {
    if (quest.enemyHealth <= 0 || quest.enemyDamage <= 0) {
      warnings.push({ path: `quests.${quest.id}`, message: 'Quest has no enemy HP or damage.' });
    }
  }

  for (const [kind, aliases] of Object.entries(data.aliases ?? {})) {
    const target = data[kind as keyof GameData];
    if (!Array.isArray(target)) {
      continue;
    }
    const ids = new Set((target as Array<{ id?: string }>).map((entry) => entry.id));
    for (const [from, to] of Object.entries((aliases ?? {}) as Record<string, string>)) {
      if (!ids.has(to)) {
        warnings.push({ path: `aliases.${kind}.${from}`, message: `Alias target "${to}" does not exist.` });
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, counts };
}

export class GameDataValidationError extends Error {
  constructor(
    readonly report: DataValidationReport,
    sourceLabel = 'game data'
  ) {
    super(
      `Invalid ${sourceLabel}: ${report.errors
        .slice(0, 5)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}${report.errors.length > 5 ? ` (+${report.errors.length - 5} more)` : ''}`
    );
    this.name = 'GameDataValidationError';
  }
}

function checkUniqueIds(entries: Array<{ id: string }>, path: string, errors: DataValidationIssue[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.id) {
      errors.push({ path, message: 'Entry without id.' });
      continue;
    }
    if (seen.has(entry.id)) {
      errors.push({ path: `${path}.${entry.id}`, message: 'Duplicate id.' });
    }
    seen.add(entry.id);
  }
}
