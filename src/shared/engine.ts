import { QUALITY_MULTIPLIERS, getBaseHero, getEffectiveHero, getMaxTierForLevel, slotLabel } from './data-utils';
import type {
  BuildConfig,
  EnchantmentData,
  FlatStatModifiers,
  GameData,
  HeroData,
  ItemData,
  ItemStats,
  PercentModifiers,
  ResolvedBuild,
  ResolvedGearLine,
  SkillData,
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

const EMPTY_FLAT_STATS: FlatStatModifiers = {
  attack: 0,
  defense: 0,
  hp: 0,
  evasion: 0,
  critChance: 0,
  critDamage: 0,
  threat: 0
};

const SPIRIT_MODIFIERS: Record<string, Partial<PercentModifiers>> = {
  ram: { defense: 0.05 },
  wolf: { attack: 0.05 },
  ox: { defense: 0.05 },
  eagle: { critChance: 0.05 },
  viper: { critDamage: 0.25 },
  cat: { evasion: 0.03 },
  bunny: { evasion: 0.03 },
  xolotl: { attack: 0.05 },
  rhino: { defense: 0.08 },
  owl: { critChance: 0.03, critDamage: 0.15 },
  armadillo: { defense: 0.1 },
  lizard: { hp: 0.1 },
  horse: { hp: 0.05 },
  hippo: { hp: 0.08 },
  shark: { attack: 0.05, critChance: 0.02 },
  walrus: { defense: 0.08 },
  lion: { attack: 0.05, defense: 0.05 },
  bear: { hp: 0.05 },
  mammoth: { hp: 0.1 },
  dinosaur: { attack: 0.1 },
  tiger: { attack: 0.05, critDamage: 0.25 },
  quetzalcoatl: { attack: 0.08 },
  phoenix: { hp: 0.1 },
  hydra: { attack: 0.08, critChance: 0.03 },
  tarrasque: { defense: 0.12 },
  carbuncle: { evasion: 0.04 },
  chimera: { attack: 0.06, defense: 0.06 },
  kraken: { critDamage: 0.35 },
  behemoth: { attack: 0.12 },
  ouroboros: { hp: 0.12 },
  bahamut: { attack: 0.1, defense: 0.1 },
  leviathan: { defense: 0.1, hp: 0.08 },
  griffin: { evasion: 0.05, critChance: 0.03 },
  titan: { hp: 0.15 }
};

export function calculateHeroStats(build: BuildConfig, data: GameData): ResolvedBuild {
  const warnings: string[] = [];
  const baseHero = getBaseHero(data, build.heroClassId) ?? null;
  const hero = getEffectiveHero(data, build.heroClassId, build.promoted) ?? baseHero;

  if (!baseHero) {
    warnings.push(`Hero class "${build.heroClassId}" was not found in the loaded data.`);
  }

  if (build.promoted && baseHero && !baseHero.promotedClassId) {
    warnings.push(`${baseHero.name} has no imported Titan Soul promotion.`);
  }

  const baseStats = hero ? scaledHeroBaseStats(hero, build.level, build.seeds) : zeroStats();
  const modifiers = { ...EMPTY_MODIFIERS };
  const flatStats = { ...EMPTY_FLAT_STATS };
  const gearLines: ResolvedGearLine[] = [];
  const maxTier = getMaxTierForLevel(data, build.level);
  const innateSkills = resolveInnateSkills(hero, data);
  const championSkill = build.championSkillId
    ? data.skills.find((candidate) => candidate.id === build.championSkillId) ?? null
    : null;
  const championEffectMultiplier = 1 + innateSkills.reduce((total, skill) => total + championSkillBoost(skill), 0);

  let itemStats: ItemStats = { ...EMPTY_ITEM_STATS };

  for (const slot of hero?.slots ?? []) {
    const selection = build.equipment.find((entry) => entry.slotId === slot.id);
    const item = selection?.itemId ? data.items.find((candidate) => candidate.id === selection.itemId) : undefined;
    const lineWarnings: string[] = [];

    if (!selection || !selection.itemId) {
      gearLines.push(emptyGearLine(slot.id, slotLabel(slot), selection));
      continue;
    }

    if (!item) {
      lineWarnings.push(`Item "${selection.itemId}" was not found.`);
      warnings.push(`Item "${selection.itemId}" in ${slot.label} was not found.`);
      gearLines.push({
        ...emptyGearLine(slot.id, slotLabel(slot), selection),
        itemId: selection.itemId,
        itemName: selection.itemId,
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

    const resolvedGear = resolveGearLine(item, selection.quality, selection.starforged, selection.elementId, selection.spiritId, data);
    itemStats = addItemStats(itemStats, resolvedGear.stats);
    addModifiers(modifiers, resolveSpiritModifiers(item, selection.spiritId, data.enchantments).modifiers);

    gearLines.push({
      ...resolvedGear,
      slotId: slot.id,
      slotLabel: slotLabel(slot),
      warnings: lineWarnings
    });
  }

  for (const skill of innateSkills) {
    applySkillEffects(skill, modifiers, flatStats, 1);
  }

  if (championSkill) {
    applySkillEffects(championSkill, modifiers, flatStats, championEffectMultiplier);
  }

  for (const skillId of build.skills.filter(Boolean)) {
    const skill = data.skills.find((candidate) => candidate.id === skillId);
    if (!skill) {
      warnings.push(`Skill "${skillId}" was not found.`);
      continue;
    }
    applySkillEffects(skill, modifiers, flatStats, 1);
  }

  const rawStats: StatBlock = {
    attack: baseStats.attack + itemStats.attack + flatStats.attack,
    defense: baseStats.defense + itemStats.defense + flatStats.defense,
    hp: baseStats.hp + itemStats.hp + flatStats.hp,
    evasion: baseStats.evasion + itemStats.evasion + flatStats.evasion,
    critChance: baseStats.critChance + itemStats.critChance + flatStats.critChance,
    critDamage: baseStats.critDamage + flatStats.critDamage,
    threat: baseStats.threat + flatStats.threat,
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
    baseHero,
    stats,
    modifiers,
    flatStats,
    innateSkills,
    championSkill,
    warnings,
    gear: gearLines,
    sourceVersion: data.metadata.officialSpreadsheetVersion
  };
}

export function resolveGearLine(
  item: ItemData,
  quality: string,
  starforged: boolean,
  elementId: string,
  spiritId: string,
  data: GameData
): ResolvedGearLine {
  const baseStats = resolveItemStats(item, quality, starforged);
  const elementEffects = resolveElementStats(item, elementId, data.enchantments);
  const spiritEffects = resolveSpiritModifiers(item, spiritId, data.enchantments);

  return {
    slotId: '',
    slotLabel: '',
    itemId: item.id,
    itemName: item.name,
    itemType: item.type,
    itemTier: item.tier,
    quality: quality as ResolvedGearLine['quality'],
    starforged,
    baseStats,
    elementStats: elementEffects.stats,
    stats: addItemStats(baseStats, elementEffects.stats),
    elementSources: elementEffects.sources,
    spiritSources: spiritEffects.sources,
    affinityBonuses: [...elementEffects.affinityBonuses, ...spiritEffects.affinityBonuses],
    warnings: []
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

function resolveInnateSkills(hero: HeroData | null | undefined, data: GameData): SkillData[] {
  if (!hero) {
    return [];
  }
  return hero.innateSkillIds
    .map((skillId) => data.skills.find((skill) => skill.id === skillId))
    .filter((skill): skill is SkillData => Boolean(skill));
}

function applySkillEffects(
  skill: SkillData,
  modifiers: PercentModifiers,
  flatStats: FlatStatModifiers,
  multiplier: number
): void {
  addModifiers(modifiers, scaleModifiers(skill.modifiers, multiplier));
  addFlatStats(flatStats, scaleFlatStats(skill.flatStats ?? EMPTY_FLAT_STATS, multiplier));
}

function championSkillBoost(skill: SkillData): number {
  const match = skill.effect.match(/\+(\d+(?:\.\d+)?)%\s+increased effect received from Champion skills/i);
  return match ? Number.parseFloat(match[1]) / 100 : 0;
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

function resolveElementStats(
  item: ItemData,
  elementId: string,
  enchantments: EnchantmentData[]
): { stats: ItemStats; sources: string[]; affinityBonuses: string[] } {
  const sources: string[] = [];
  const affinityBonuses: string[] = [];
  let score = 0;

  const selected = enchantments.find((candidate) => candidate.id === elementId);
  if (selected) {
    const bonus = elementAffinityBonus(item, selected);
    score += elementScore(selected) + bonus;
    sources.push(selected.name);
    if (bonus > 0) {
      affinityBonuses.push(`${item.elementalAffinity} affinity: +${bonus} Element`);
    }
  }

  const builtInElement = enchantments.find((candidate) => candidate.name === item.builtInElement);
  if (builtInElement) {
    const bonus = elementAffinityBonus(item, builtInElement);
    score += elementScore(builtInElement) + bonus;
    sources.push(`${builtInElement.name} built-in`);
    if (bonus > 0) {
      affinityBonuses.push(`${item.elementalAffinity} affinity on built-in: +${bonus} Element`);
    }
  }

  if (score === 0) {
    return { stats: { ...EMPTY_ITEM_STATS }, sources, affinityBonuses };
  }

  return {
    stats: {
      attack: item.stats.attack > 0 ? roundShopTitans(score * 3.8) : 0,
      defense: item.stats.defense > 0 ? roundShopTitans(score * 2.6) : 0,
      hp: item.stats.hp > 0 ? roundShopTitans(score * 1.8) : 0,
      evasion: 0,
      critChance: 0
    },
    sources,
    affinityBonuses
  };
}

function resolveSpiritModifiers(
  item: ItemData,
  spiritId: string,
  enchantments: EnchantmentData[]
): { modifiers: PercentModifiers; sources: string[]; affinityBonuses: string[] } {
  const modifiers = { ...EMPTY_MODIFIERS };
  const sources: string[] = [];
  const affinityBonuses: string[] = [];
  const selectedSpirit = enchantments.find((candidate) => candidate.id === spiritId)?.name ?? '';

  for (const spiritName of [selectedSpirit, item.builtInSpirit]) {
    if (!spiritName) {
      continue;
    }
    const key = spiritKey(spiritName);
    const baseModifiers = SPIRIT_MODIFIERS[key] ?? {};
    const affinityMultiplier = spiritAffinityMatches(item, key) ? 1.25 : 1;
    addModifiers(modifiers, scaleModifiers(baseModifiers, affinityMultiplier));
    sources.push(spiritName === item.builtInSpirit ? `${spiritName} built-in` : spiritName);
    if (affinityMultiplier > 1) {
      affinityBonuses.push(`${item.spiritAffinity} affinity: +25% spirit effect`);
    }
  }

  return { modifiers, sources, affinityBonuses };
}

function elementScore(enchantment: EnchantmentData | undefined): number {
  if (!enchantment || enchantment.type !== 'Element') {
    return 0;
  }
  return Object.values(enchantment.elementScores).reduce((total, score) => total + score, 0);
}

function elementAffinityBonus(item: ItemData, enchantment: EnchantmentData): number {
  const affinityTokens = item.elementalAffinity
    .split(',')
    .map((entry) => normalizeAffinity(entry))
    .filter(Boolean);
  if (affinityTokens.length === 0 || enchantment.type !== 'Element') {
    return 0;
  }

  const primaryElement = primaryElementKey(enchantment);
  if (!primaryElement) {
    return 0;
  }

  if (affinityTokens.includes('all')) {
    return 5;
  }
  return affinityTokens.includes(primaryElement) ? 10 : 0;
}

function primaryElementKey(enchantment: EnchantmentData): string {
  const [key] =
    Object.entries(enchantment.elementScores).sort((left, right) => right[1] - left[1])[0] ?? [];
  return key === 'luxurious' ? 'gold' : key ?? '';
}

function spiritAffinityMatches(item: ItemData, key: string): boolean {
  return item.spiritAffinity
    .split(',')
    .map((entry) => spiritKey(entry))
    .filter(Boolean)
    .includes(key);
}

function spiritKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/'s/g, '')
    .replace(/\b(spirit|ferocity|endurance|accuracy|lethality|grace|hops|robustness|tenacity|wisdom|regeneration|bloodlust|vitality|senses|power|solemnity|presence|pride|tradition|sovereignty|violence|whimsy|malignity|cruelty|eternity|assurance|freedom|serenity|wile|immortality|onslaught|terror|nonchalance)\b/g, '')
    .trim()
    .split(/\s+/)[0];
}

function normalizeAffinity(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'gold') {
    return 'gold';
  }
  return normalized;
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

function emptyGearLine(slotId: string, label: string, selection?: { quality?: string; starforged?: boolean }): ResolvedGearLine {
  return {
    slotId,
    slotLabel: label,
    itemId: '',
    itemName: 'Empty',
    itemType: '',
    itemTier: 0,
    quality: (selection?.quality ?? 'normal') as ResolvedGearLine['quality'],
    starforged: selection?.starforged ?? false,
    baseStats: { ...EMPTY_ITEM_STATS },
    elementStats: { ...EMPTY_ITEM_STATS },
    stats: { ...EMPTY_ITEM_STATS },
    elementSources: [],
    spiritSources: [],
    affinityBonuses: [],
    warnings: []
  };
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

function addFlatStats(target: FlatStatModifiers, source: Partial<FlatStatModifiers>): void {
  target.attack += source.attack ?? 0;
  target.defense += source.defense ?? 0;
  target.hp += source.hp ?? 0;
  target.evasion += source.evasion ?? 0;
  target.critChance += source.critChance ?? 0;
  target.critDamage += source.critDamage ?? 0;
  target.threat += source.threat ?? 0;
}

function scaleModifiers(source: Partial<PercentModifiers>, multiplier: number): PercentModifiers {
  return {
    attack: (source.attack ?? 0) * multiplier,
    defense: (source.defense ?? 0) * multiplier,
    hp: (source.hp ?? 0) * multiplier,
    evasion: (source.evasion ?? 0) * multiplier,
    critChance: (source.critChance ?? 0) * multiplier,
    critDamage: (source.critDamage ?? 0) * multiplier
  };
}

function scaleFlatStats(source: Partial<FlatStatModifiers>, multiplier: number): FlatStatModifiers {
  return {
    attack: (source.attack ?? 0) * multiplier,
    defense: (source.defense ?? 0) * multiplier,
    hp: (source.hp ?? 0) * multiplier,
    evasion: (source.evasion ?? 0) * multiplier,
    critChance: (source.critChance ?? 0) * multiplier,
    critDamage: (source.critDamage ?? 0) * multiplier,
    threat: (source.threat ?? 0) * multiplier
  };
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
