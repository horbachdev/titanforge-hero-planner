import { QUALITY_MULTIPLIERS, getHero, getMaxTierForLevel, slotLabel } from './data-utils';
import type {
  BuildConfig,
  EnchantmentData,
  GameData,
  HeroData,
  ItemData,
  ItemStats,
  PercentModifiers,
  ResolvedBuild,
  ResolvedGearLine,
  StatBlock
} from './types';

const EMPTY_ITEM_STATS: ItemStats = {
  attack: 0,
  defense: 0,
  hp: 0,
  evasion: 0,
  critChance: 0
};

const EMPTY_MODIFIERS: PercentModifiers = {
  attack: 0,
  defense: 0,
  hp: 0,
  evasion: 0,
  critChance: 0,
  critDamage: 0
};

const SPIRIT_MODIFIERS: Record<string, Partial<PercentModifiers>> = {
  wolf: { attack: 0.05 },
  ox: { defense: 0.05 },
  bear: { hp: 0.05 },
  eagle: { critChance: 0.05 },
  viper: { critDamage: 0.25 },
  cat: { evasion: 0.03 },
  bunny: { evasion: 0.03 },
  armadillo: { defense: 0.1 },
  lizard: { hp: 0.1 },
  shark: { attack: 0.05, critChance: 0.02 },
  dinosaur: { attack: 0.1 },
  tiger: { attack: 0.05, critDamage: 0.25 }
};

export function calculateHeroStats(build: BuildConfig, data: GameData): ResolvedBuild {
  const warnings: string[] = [];
  const hero = getHero(data, build.heroClassId) ?? null;

  if (!hero) {
    warnings.push(`Hero class "${build.heroClassId}" was not found in the loaded data.`);
  }

  const baseStats = hero ? scaledHeroBaseStats(hero, build.level, build.seeds) : zeroStats();
  const modifiers = { ...EMPTY_MODIFIERS };
  const gearLines: ResolvedGearLine[] = [];
  const maxTier = getMaxTierForLevel(data, build.level);

  let itemStats: ItemStats = { ...EMPTY_ITEM_STATS };

  for (const slot of hero?.slots ?? []) {
    const selection = build.equipment.find((entry) => entry.slotId === slot.id);
    const item = selection?.itemId ? data.items.find((candidate) => candidate.id === selection.itemId) : undefined;
    const lineWarnings: string[] = [];

    if (!selection || !selection.itemId) {
      gearLines.push({
        slotId: slot.id,
        slotLabel: slotLabel(slot),
        itemName: 'Empty',
        quality: selection?.quality ?? 'normal',
        starforged: selection?.starforged ?? false,
        stats: { ...EMPTY_ITEM_STATS },
        warnings: []
      });
      continue;
    }

    if (!item) {
      lineWarnings.push(`Item "${selection.itemId}" was not found.`);
      warnings.push(`Item "${selection.itemId}" in ${slot.label} was not found.`);
      gearLines.push({
        slotId: slot.id,
        slotLabel: slotLabel(slot),
        itemName: selection.itemId,
        quality: selection.quality,
        starforged: selection.starforged,
        stats: { ...EMPTY_ITEM_STATS },
        warnings: lineWarnings
      });
      continue;
    }

    if (!slot.allowedTypes.includes(item.type)) {
      lineWarnings.push(`${item.name} is a ${item.type}, which is not valid for ${slot.label}.`);
      warnings.push(`${item.name} is not valid for ${slot.label}.`);
    }

    if (item.tier > maxTier) {
      lineWarnings.push(`${item.name} is T${item.tier}; level ${build.level} allows up to T${maxTier}.`);
      warnings.push(`${item.name} exceeds the level ${build.level} item tier cap.`);
    }

    const resolvedItemStats = resolveItemStats(item, selection.quality, selection.starforged);
    const elementStats = resolveElementStats(item, selection.elementId, data.enchantments);
    const spiritModifiers = resolveSpiritModifiers(item, selection.spiritId, data.enchantments);

    itemStats = addItemStats(itemStats, addItemStats(resolvedItemStats, elementStats));
    addModifiers(modifiers, spiritModifiers);

    gearLines.push({
      slotId: slot.id,
      slotLabel: slotLabel(slot),
      itemName: item.name,
      quality: selection.quality,
      starforged: selection.starforged,
      stats: addItemStats(resolvedItemStats, elementStats),
      warnings: lineWarnings
    });
  }

  for (const skillId of build.skills.filter(Boolean)) {
    const skill = data.skills.find((candidate) => candidate.id === skillId);
    if (!skill) {
      warnings.push(`Skill "${skillId}" was not found.`);
      continue;
    }
    addModifiers(modifiers, skill.modifiers);
  }

  const rawStats: StatBlock = {
    attack: baseStats.attack + itemStats.attack,
    defense: baseStats.defense + itemStats.defense,
    hp: baseStats.hp + itemStats.hp,
    evasion: baseStats.evasion + itemStats.evasion,
    critChance: baseStats.critChance + itemStats.critChance,
    critDamage: baseStats.critDamage,
    threat: baseStats.threat,
    power: 0
  };

  const stats: StatBlock = {
    attack: roundShopTitans(rawStats.attack * (1 + modifiers.attack)),
    defense: roundShopTitans(rawStats.defense * (1 + modifiers.defense)),
    hp: roundShopTitans(rawStats.hp * (1 + modifiers.hp)),
    evasion: clamp(roundPercent(rawStats.evasion + modifiers.evasion * 100), 0, 75),
    critChance: clamp(roundPercent(rawStats.critChance + modifiers.critChance * 100), 0, 100),
    critDamage: roundPercent(rawStats.critDamage + modifiers.critDamage),
    threat: rawStats.threat,
    power: 0
  };

  if (rawStats.evasion + modifiers.evasion * 100 > 75) {
    warnings.push('Evasion is capped at 75% in this MVP engine.');
  }

  stats.power = calculatePower(stats);

  return {
    build,
    hero,
    stats,
    modifiers,
    warnings,
    gear: gearLines,
    sourceVersion: data.metadata.officialSpreadsheetVersion
  };
}

export function resolveItemStats(item: ItemData, quality: string, starforged: boolean): ItemStats {
  const qualityMultiplier = QUALITY_MULTIPLIERS[quality as keyof typeof QUALITY_MULTIPLIERS] ?? 1;
  const starforgeMultiplier = starforged ? getStarforgeStatMultiplier(item) : 1;

  return {
    attack: roundShopTitans(item.stats.attack * starforgeMultiplier * qualityMultiplier),
    defense: roundShopTitans(item.stats.defense * starforgeMultiplier * qualityMultiplier),
    hp: roundShopTitans(item.stats.hp * starforgeMultiplier * qualityMultiplier),
    evasion: roundPercent(item.stats.evasion),
    critChance: roundPercent(item.stats.critChance)
  };
}

export function getStarforgeStatMultiplier(item: ItemData): number {
  const milestone = item.starforgedMilestones.find((entry) =>
    /\+25%\s+Base\s+ATK,\s*DEF\s+and\s+HP/i.test(entry.description)
  );
  return milestone ? 1.25 : 1;
}

function scaledHeroBaseStats(hero: HeroData, level: number, seeds: BuildConfig['seeds']): StatBlock {
  const levelDelta = Math.max(0, level - 1);
  const offenseScale = 1 + levelDelta * 0.07;
  const defenseScale = 1 + levelDelta * 0.065;
  const hpScale = 1 + levelDelta * 0.05;

  return {
    attack: roundShopTitans(hero.baseStats.attack * offenseScale + seeds.attack * 10),
    defense: roundShopTitans(hero.baseStats.defense * defenseScale + seeds.defense * 10),
    hp: roundShopTitans(hero.baseStats.hp * hpScale + seeds.hp),
    evasion: hero.baseStats.evasion,
    critChance: hero.baseStats.critChance,
    critDamage: hero.baseStats.critDamage,
    threat: hero.baseStats.threat,
    power: 0
  };
}

function resolveElementStats(item: ItemData, elementId: string, enchantments: EnchantmentData[]): ItemStats {
  const enchantment = enchantments.find((candidate) => candidate.id === elementId);
  const builtInElement = enchantments.find((candidate) => candidate.name === item.builtInElement);
  const score = elementScore(enchantment) + elementScore(builtInElement);

  if (score === 0) {
    return { ...EMPTY_ITEM_STATS };
  }

  return {
    attack: item.stats.attack > 0 ? roundShopTitans(score * 3.8) : 0,
    defense: item.stats.defense > 0 ? roundShopTitans(score * 2.6) : 0,
    hp: item.stats.hp > 0 ? roundShopTitans(score * 1.8) : 0,
    evasion: 0,
    critChance: 0
  };
}

function resolveSpiritModifiers(
  item: ItemData,
  spiritId: string,
  enchantments: EnchantmentData[]
): PercentModifiers {
  const modifiers = { ...EMPTY_MODIFIERS };
  const selectedSpirit = enchantments.find((candidate) => candidate.id === spiritId)?.name ?? '';
  const builtInSpirit = item.builtInSpirit;

  for (const spiritName of [selectedSpirit, builtInSpirit]) {
    const key = spiritName.toLowerCase().replace(/\s+spirit$/, '').split(/\s+/)[0];
    addModifiers(modifiers, SPIRIT_MODIFIERS[key] ?? {});
  }

  return modifiers;
}

function elementScore(enchantment: EnchantmentData | undefined): number {
  if (!enchantment || enchantment.type !== 'Element') {
    return 0;
  }
  return Object.values(enchantment.elementScores).reduce((total, score) => total + score, 0);
}

function calculatePower(stats: StatBlock): number {
  return roundShopTitans(
    stats.attack +
      stats.defense * 1.25 +
      stats.hp * 3 +
      stats.critChance * 32 +
      stats.critDamage * 120 +
      stats.evasion * 42
  );
}

function addItemStats(left: ItemStats, right: ItemStats): ItemStats {
  return {
    attack: left.attack + right.attack,
    defense: left.defense + right.defense,
    hp: left.hp + right.hp,
    evasion: left.evasion + right.evasion,
    critChance: left.critChance + right.critChance
  };
}

function addModifiers(target: PercentModifiers, source: Partial<PercentModifiers>): void {
  target.attack += source.attack ?? 0;
  target.defense += source.defense ?? 0;
  target.hp += source.hp ?? 0;
  target.evasion += source.evasion ?? 0;
  target.critChance += source.critChance ?? 0;
  target.critDamage += source.critDamage ?? 0;
}

function zeroStats(): StatBlock {
  return {
    attack: 0,
    defense: 0,
    hp: 0,
    evasion: 0,
    critChance: 0,
    critDamage: 0,
    threat: 0,
    power: 0
  };
}

function roundShopTitans(value: number): number {
  const fraction = value - Math.floor(value);
  if (Math.abs(fraction - 0.5) < Number.EPSILON) {
    return Math.floor(value);
  }
  return Math.round(value);
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
