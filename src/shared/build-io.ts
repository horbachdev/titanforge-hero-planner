import { defaultBuild, getHero, normalizeEquipmentForHero } from './data-utils';
import type { BuildConfig, GameData, ParseResult, ValidationError } from './types';

export function serializeBuild(build: BuildConfig): string {
  return JSON.stringify(build, null, 2);
}

export function parseBuildJson(json: string, data: GameData): BuildConfig | ValidationError[] {
  const result = parseBuildJsonDetailed(json, data);
  return result.ok ? result.build : result.errors;
}

export function parseBuildJsonDetailed(json: string, data: GameData): ParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      errors: [{ field: 'json', message: error instanceof Error ? error.message : 'Invalid JSON.' }]
    };
  }

  const errors = validateBuildShape(parsed);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const build = parsed as BuildConfig;
  const warnings = validateBuildConfig(build, data);
  const hero = getHero(data, build.heroClassId);

  return {
    ok: true,
    build: hero ? { ...build, equipment: normalizeEquipmentForHero(build, hero) } : build,
    warnings
  };
}

export function validateBuildConfig(build: BuildConfig, data: GameData): ValidationError[] {
  const warnings: ValidationError[] = [];
  const hero = getHero(data, build.heroClassId);

  if (!hero) {
    warnings.push({ field: 'heroClassId', message: `Unknown hero class "${build.heroClassId}".` });
  }

  for (const [index, skillId] of build.skills.entries()) {
    if (skillId && !data.skills.some((skill) => skill.id === skillId)) {
      warnings.push({ field: `skills.${index}`, message: `Unknown skill "${skillId}".` });
    }
  }

  for (const entry of build.equipment) {
    if (entry.itemId && !data.items.some((item) => item.id === entry.itemId)) {
      warnings.push({ field: `equipment.${entry.slotId}`, message: `Unknown item "${entry.itemId}".` });
    }
    if (entry.elementId && !data.enchantments.some((enchantment) => enchantment.id === entry.elementId)) {
      warnings.push({ field: `equipment.${entry.slotId}.elementId`, message: `Unknown element "${entry.elementId}".` });
    }
    if (entry.spiritId && !data.enchantments.some((enchantment) => enchantment.id === entry.spiritId)) {
      warnings.push({ field: `equipment.${entry.slotId}.spiritId`, message: `Unknown spirit "${entry.spiritId}".` });
    }
  }

  return warnings;
}

export function migrateOrDefaultBuild(value: string | null, data: GameData): BuildConfig {
  if (!value) {
    return defaultBuild(data);
  }

  const result = parseBuildJsonDetailed(value, data);
  return result.ok ? result.build : defaultBuild(data);
}

function validateBuildShape(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!value || typeof value !== 'object') {
    return [{ field: 'root', message: 'Build export must be a JSON object.' }];
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) {
    errors.push({ field: 'schemaVersion', message: 'Only build schema version 1 is supported.' });
  }
  if (typeof candidate.id !== 'string') {
    errors.push({ field: 'id', message: 'Build id must be a string.' });
  }
  if (typeof candidate.name !== 'string') {
    errors.push({ field: 'name', message: 'Build name must be a string.' });
  }
  if (typeof candidate.heroClassId !== 'string') {
    errors.push({ field: 'heroClassId', message: 'Hero class id must be a string.' });
  }
  if (typeof candidate.level !== 'number') {
    errors.push({ field: 'level', message: 'Level must be a number.' });
  }
  if (!Array.isArray(candidate.skills)) {
    errors.push({ field: 'skills', message: 'Skills must be an array.' });
  }
  if (!Array.isArray(candidate.equipment)) {
    errors.push({ field: 'equipment', message: 'Equipment must be an array.' });
  }

  return errors;
}
