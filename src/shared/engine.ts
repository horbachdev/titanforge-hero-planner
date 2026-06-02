import { QUALITY_MULTIPLIERS, getBaseHero, getEffectiveHero, getMaxTierForLevel, slotLabel } from './data-utils';
import type {
  BuildConfig,
  ChampionData,
  ChampionBuildConfig,
  ElementScores,
  EnchantmentData,
  FlatStatModifiers,
  GameData,
  HeroData,
  ItemData,
  ItemStats,
  PercentModifiers,
  ResolvedBuild,
  ResolvedChampionBuild,
  ResolvedChampion,
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

interface SpiritEffect {
  modifiers?: Partial<PercentModifiers>;
  flatStats?: Partial<FlatStatModifiers>;
  matchedModifiers?: Partial<PercentModifiers>;
  matchedFlatStats?: Partial<FlatStatModifiers>;
}

const SPIRIT_EFFECTS: Record<string, SpiritEffect> = {
  wolf: {
    modifiers: { attack: 0.05 },
    matchedModifiers: { attack: 0.1 }
  },
  ram: {
    modifiers: { defense: 0.05 },
    matchedModifiers: { defense: 0.1 }
  },
  eagle: {
    modifiers: { critChance: 0.02 },
    matchedModifiers: { critChance: 0.03 }
  },
  ox: {
    modifiers: { hp: 0.03 },
    matchedModifiers: { hp: 0.05 }
  },
  viper: {
    modifiers: { critDamage: 0.15 },
    matchedModifiers: { critDamage: 0.2 }
  },
  cat: {
    modifiers: { evasion: 0.02 },
    matchedModifiers: { evasion: 0.03 }
  },
  bear: {
    modifiers: { attack: 0.05 },
    flatStats: { hp: 15 },
    matchedModifiers: { attack: 0.07 },
    matchedFlatStats: { hp: 20 }
  },
  walrus: {
    modifiers: { hp: 0.05 },
    matchedModifiers: { hp: 0.08 }
  },
  mammoth: {
    modifiers: { defense: 0.1 },
    flatStats: { threat: 10 },
    matchedModifiers: { defense: 0.13 },
    matchedFlatStats: { threat: 10 }
  },
  lion: {
    modifiers: { attack: 0.05, evasion: 0.01 },
    matchedModifiers: { attack: 0.07, evasion: 0.02 }
  },
  tiger: {
    modifiers: { defense: 0.05, evasion: 0.01 },
    matchedModifiers: { defense: 0.07, evasion: 0.02 }
  },
  phoenix: {
    modifiers: { hp: 0.04 },
    matchedModifiers: { hp: 0.05 }
  },
  hydra: {
    flatStats: { defense: 100, hp: 25 },
    matchedFlatStats: { defense: 125, hp: 35 }
  },
  tarrasque: {
    modifiers: { defense: 0.2 },
    matchedModifiers: { defense: 0.25 }
  },
  carbuncle: {
    modifiers: { evasion: 0.02, critChance: 0.02 },
    matchedModifiers: { evasion: 0.03, critChance: 0.03 }
  },
  chimera: {
    modifiers: { attack: 0.1, critDamage: 0.1 },
    matchedModifiers: { attack: 0.15, critDamage: 0.15 }
  },
  kraken: {
    modifiers: { attack: 0.1 },
    flatStats: { attack: 100 },
    matchedModifiers: { attack: 0.15 },
    matchedFlatStats: { attack: 125 }
  },
  christmas: {
    modifiers: { hp: 0.04 },
    flatStats: { hp: 20 },
    matchedModifiers: { hp: 0.1 },
    matchedFlatStats: { hp: 40 }
  },
  bunny: {
    modifiers: { hp: 0.02, evasion: 0.01 },
    matchedModifiers: { hp: 0.03, evasion: 0.02 }
  },
  bahamut: {
    modifiers: { hp: 0.03 },
    flatStats: { hp: 50 },
    matchedModifiers: { hp: 0.05 },
    matchedFlatStats: { hp: 70 }
  },
  behemoth: {
    modifiers: { attack: 0.13, defense: 0.05 },
    matchedModifiers: { attack: 0.18, defense: 0.08 }
  },
  griffin: {
    modifiers: { defense: 0.08, evasion: 0.03 },
    matchedModifiers: { defense: 0.1, evasion: 0.04 }
  },
  leviathan: {
    modifiers: { attack: 0.08, critChance: 0.03 },
    matchedModifiers: { attack: 0.1, critChance: 0.04 }
  },
  ouroboros: {
    modifiers: { defense: 0.1 },
    matchedModifiers: { defense: 0.15 }
  },
  ouruboros: {
    modifiers: { defense: 0.1 },
    matchedModifiers: { defense: 0.15 }
  },
  titan: {
    modifiers: { hp: 0.15 },
    matchedModifiers: { hp: 0.2 }
  }
};

export interface StatCalculationContext {
  championSkillId?: string;
}

export function calculateHeroStats(build: BuildConfig, data: GameData, context: StatCalculationContext = {}): ResolvedBuild {
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
  const elementScores: ElementScores = {};
  const maxTier = getMaxTierForLevel(data, build.level);
  const innateSkills = resolveInnateSkills(hero, data);
  const championSkill = context.championSkillId
    ? data.skills.find((candidate) => candidate.id === context.championSkillId) ?? null
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
    addModifiers(modifiers, resolvedGear.spiritModifiers);
    addFlatStats(flatStats, resolvedGear.spiritFlatStats);
    addElementScores(elementScores, resolvedGear.elementScores);

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
    elementScores,
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
  const spiritEffects = resolveSpiritEffects(item, spiritId, data.enchantments);

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
    elementScores: elementEffects.elementScores,
    spiritModifiers: spiritEffects.modifiers,
    spiritFlatStats: spiritEffects.flatStats,
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
    evasion: roundPercent(normalizePercentStat(item.stats.evasion)),
    critChance: roundPercent(normalizePercentStat(item.stats.critChance))
  };
}

export function getStarforgeStatMultiplier(item: ItemData): number {
  const milestone = item.starforgedMilestones.find((entry) =>
    /\+25%\s+Base\s+ATK,\s*DEF\s+and\s+HP/i.test(entry.description)
  );
  return milestone ? 1.25 : 1;
}

export function getChampionMaxRank(champion: ChampionData): number {
  return Math.max(...champion.rankRewards.filter((reward) => !reward.repeatable).map((reward) => reward.rank), 1);
}

export function getChampionLeaderSkillId(champion: ChampionData, rank: number): string {
  const matchingReward = champion.rankRewards
    .filter((reward) => !reward.repeatable && reward.rank <= rank && reward.leaderSkillId)
    .sort((left, right) => right.rank - left.rank)[0];
  return matchingReward?.leaderSkillId ?? champion.leaderSkillIds[0] ?? '';
}

export function resolveChampion(
  champion: ChampionData,
  data: GameData,
  rank = getChampionMaxRank(champion),
  powerUps = 0
): ResolvedChampion {
  const maxRank = getChampionMaxRank(champion);
  const boundedRank = clamp(Math.round(rank), 1, maxRank);
  const boundedPowerUps = Math.max(0, Math.round(powerUps));
  const regularRewards = champion.rankRewards.filter((reward) => !reward.repeatable && reward.rank <= boundedRank);
  const repeatableReward = champion.rankRewards.find((reward) => reward.repeatable);
  const flatStats = regularRewards.reduce(
    (total, reward) => addFlatStatBlocks(total, reward.statGains),
    { ...EMPTY_FLAT_STATS }
  );

  if (repeatableReward && boundedPowerUps > 0) {
    const repeatedStats = scaleFlatStats(repeatableReward.statGains, boundedPowerUps);
    Object.assign(flatStats, addFlatStatBlocks(flatStats, repeatedStats));
  }

  const stats: StatBlock = {
    attack: champion.baseStats.attack + flatStats.attack,
    defense: champion.baseStats.defense + flatStats.defense,
    hp: champion.baseStats.hp + flatStats.hp,
    evasion: champion.baseStats.evasion + flatStats.evasion,
    critChance: champion.baseStats.critChance + flatStats.critChance,
    critDamage: champion.baseStats.critDamage + flatStats.critDamage,
    threat: champion.baseStats.threat + flatStats.threat,
    power: 0
  };
  stats.power = calculatePower(stats);

  const leaderSkillId = getChampionLeaderSkillId(champion, boundedRank);
  return {
    champion,
    rank: boundedRank,
    powerUps: boundedPowerUps,
    stats,
    leaderSkill: data.skills.find((skill) => skill.id === leaderSkillId) ?? null,
    appliedRewards: regularRewards
  };
}

export function calculateChampionBuildStats(build: ChampionBuildConfig, data: GameData): ResolvedChampionBuild {
  const warnings: string[] = [];
  const champion = data.champions.find((entry) => entry.id === build.championId) ?? null;

  if (!champion) {
    return {
      build,
      champion: null,
      stats: zeroStats(),
      leaderSkill: null,
      gear: [],
      elementScores: {},
      warnings: [`Champion "${build.championId}" was not found.`],
      sourceVersion: data.metadata.officialSpreadsheetVersion
    };
  }

  const resolvedChampion = resolveChampion(champion, data, build.championSoul ? build.rank + 2 : build.rank, build.powerUps);
  const soulMultiplier = build.championSoul ? 1.5 : 1;
  const championStats = {
    ...resolvedChampion.stats,
    attack: roundShopTitans(resolvedChampion.stats.attack * soulMultiplier),
    defense: roundShopTitans(resolvedChampion.stats.defense * soulMultiplier),
    hp: roundShopTitans(resolvedChampion.stats.hp * soulMultiplier)
  };
  const modifiers = { ...EMPTY_MODIFIERS };
  const flatStats = { ...EMPTY_FLAT_STATS };
  const gearLines: ResolvedGearLine[] = [];
  const elementScores: ElementScores = {};
  let itemStats: ItemStats = { ...EMPTY_ITEM_STATS };

  for (const [selection, expectedType, label] of [
    [build.familiar, 'Familiar', 'Familiar'],
    [build.aurasong, 'Aurasong', 'Aurasong']
  ] as Array<[ChampionBuildConfig['familiar'], string, string]>) {
    if (!selection.itemId) {
      gearLines.push(emptyGearLine(selection.slotId, label, selection));
      continue;
    }

    const item = data.items.find((candidate) => candidate.id === selection.itemId);
    if (!item) {
      warnings.push(`${label} item "${selection.itemId}" was not found.`);
      gearLines.push({
        ...emptyGearLine(selection.slotId, label, selection),
        itemId: selection.itemId,
        itemName: selection.itemId,
        warnings: [`${label} item "${selection.itemId}" was not found.`]
      });
      continue;
    }

    if (item.type !== expectedType) {
      warnings.push(`${item.name} is a ${item.type}, not a ${expectedType}.`);
    }

    const resolvedGear = resolveGearLine(item, selection.quality, selection.starforged, selection.elementId, selection.spiritId, data);
    itemStats = addItemStats(itemStats, resolvedGear.stats);
    addModifiers(modifiers, resolvedGear.spiritModifiers);
    addFlatStats(flatStats, resolvedGear.spiritFlatStats);
    addElementScores(elementScores, resolvedGear.elementScores);
    gearLines.push({
      ...resolvedGear,
      slotId: selection.slotId,
      slotLabel: label
    });
  }

  const rawStats: StatBlock = {
    attack: championStats.attack + itemStats.attack + build.seeds.attack * 4 + flatStats.attack,
    defense: championStats.defense + itemStats.defense + build.seeds.defense * 4 + flatStats.defense,
    hp: championStats.hp + itemStats.hp + build.seeds.hp + flatStats.hp,
    evasion: championStats.evasion + itemStats.evasion + flatStats.evasion,
    critChance: championStats.critChance + itemStats.critChance + flatStats.critChance,
    critDamage: championStats.critDamage + flatStats.critDamage,
    threat: championStats.threat + flatStats.threat,
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
  stats.power = calculatePower(stats);

  return {
    build,
    champion,
    stats,
    leaderSkill: resolvedChampion.leaderSkill,
    gear: gearLines,
    elementScores,
    warnings,
    sourceVersion: data.metadata.officialSpreadsheetVersion
  };
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
): { stats: ItemStats; elementScores: ElementScores; sources: string[]; affinityBonuses: string[] } {
  const sources: string[] = [];
  const affinityBonuses: string[] = [];
  const elementScores: ElementScores = {};
  const builtInElement = findEnchantmentByName(enchantments, item.builtInElement, 'Element');

  const selected = builtInElement ? undefined : enchantments.find((candidate) => candidate.id === elementId);
  if (selected) {
    addElementScoreSource(elementScores, selected, elementAffinityBonus(item, selected));
    sources.push(selected.name);
    const bonus = elementAffinityBonus(item, selected);
    if (bonus > 0) {
      affinityBonuses.push(`${item.elementalAffinity} affinity: +${bonus} Element`);
    }
  }

  if (builtInElement) {
    addElementScoreSource(elementScores, builtInElement, 0);
    sources.push(`${builtInElement.name} built-in`);
  }

  const score = totalElementScore(elementScores);
  if (score === 0) {
    return { stats: { ...EMPTY_ITEM_STATS }, elementScores, sources, affinityBonuses };
  }

  return {
    stats: {
      attack: item.stats.attack > 0 ? roundShopTitans(score * 3.8) : 0,
      defense: item.stats.defense > 0 ? roundShopTitans(score * 2.6) : 0,
      hp: item.stats.hp > 0 ? roundShopTitans(score * 1.8) : 0,
      evasion: 0,
      critChance: 0
    },
    elementScores,
    sources,
    affinityBonuses
  };
}

function resolveSpiritEffects(
  item: ItemData,
  spiritId: string,
  enchantments: EnchantmentData[]
): { modifiers: PercentModifiers; flatStats: FlatStatModifiers; sources: string[]; affinityBonuses: string[] } {
  const modifiers = { ...EMPTY_MODIFIERS };
  const flatStats = { ...EMPTY_FLAT_STATS };
  const sources: string[] = [];
  const affinityBonuses: string[] = [];
  const builtInSpirit = findEnchantmentByName(enchantments, item.builtInSpirit, 'Spirit')?.name ?? item.builtInSpirit;
  const selectedSpirit = builtInSpirit ? '' : enchantments.find((candidate) => candidate.id === spiritId)?.name ?? '';
  const slotMultiplier = isTotemItem(item) ? 2 : 1;

  for (const { spiritName, builtIn } of [
    { spiritName: selectedSpirit, builtIn: false },
    { spiritName: builtInSpirit, builtIn: true }
  ]) {
    if (!spiritName) {
      continue;
    }
    const key = spiritKey(spiritName);
    const effect = SPIRIT_EFFECTS[key];
    const affinityMatches = !builtIn && spiritAffinityMatches(item, key);
    const baseModifiers = affinityMatches ? effect?.matchedModifiers ?? effect?.modifiers ?? {} : effect?.modifiers ?? {};
    const baseFlatStats = affinityMatches ? effect?.matchedFlatStats ?? effect?.flatStats ?? {} : effect?.flatStats ?? {};

    addModifiers(modifiers, scaleModifiers(baseModifiers, slotMultiplier));
    addFlatStats(flatStats, scaleFlatStats(baseFlatStats, slotMultiplier));
    sources.push(builtIn ? `${spiritName} built-in` : spiritName);
    if (affinityMatches) {
      affinityBonuses.push(`${item.spiritAffinity} affinity: Ress matched spirit columns`);
    }
    if (slotMultiplier > 1) {
      affinityBonuses.push(`${item.type}: x2 spirit effect`);
    }
  }

  return { modifiers, flatStats, sources, affinityBonuses };
}

function findEnchantmentByName(
  enchantments: EnchantmentData[],
  name: string,
  type: 'Element' | 'Spirit'
): EnchantmentData | undefined {
  const normalizedName = normalizeEnchantmentName(name);
  if (!normalizedName) {
    return undefined;
  }
  return enchantments.find(
    (candidate) => candidate.type === type && normalizeEnchantmentName(candidate.name) === normalizedName
  );
}

function addElementScoreSource(target: ElementScores, enchantment: EnchantmentData, affinityBonus: number): void {
  for (const [key, score] of Object.entries(enchantment.elementScores)) {
    target[key] = (target[key] ?? 0) + score;
  }

  const primaryElement = primaryElementScoreKey(enchantment);
  if (affinityBonus > 0 && primaryElement) {
    target[primaryElement] = (target[primaryElement] ?? 0) + affinityBonus;
  }
}

function normalizeEnchantmentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/\(.+?\)/g, '')
    .replace(/\b(element|spirit)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function totalElementScore(scores: ElementScores): number {
  return Object.values(scores).reduce((total, score) => total + score, 0);
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

function primaryElementScoreKey(enchantment: EnchantmentData): string {
  const [key] =
    Object.entries(enchantment.elementScores).sort((left, right) => right[1] - left[1])[0] ?? [];
  return key ?? '';
}

function spiritAffinityMatches(item: ItemData, key: string): boolean {
  return item.spiritAffinity
    .split(',')
    .map((entry) => spiritKey(entry))
    .filter(Boolean)
    .includes(key);
}

function isTotemItem(item: ItemData): boolean {
  return /^(Idol|Totem)$/i.test(item.type);
}

function spiritKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']s/g, '')
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
    elementScores: {},
    spiritModifiers: { ...EMPTY_MODIFIERS },
    spiritFlatStats: { ...EMPTY_FLAT_STATS },
    stats: { ...EMPTY_ITEM_STATS },
    elementSources: [],
    spiritSources: [],
    affinityBonuses: [],
    warnings: []
  };
}

function addElementScores(target: ElementScores, source: ElementScores): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
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

function addFlatStatBlocks(left: FlatStatModifiers, right: Partial<FlatStatModifiers>): FlatStatModifiers {
  return {
    attack: left.attack + (right.attack ?? 0),
    defense: left.defense + (right.defense ?? 0),
    hp: left.hp + (right.hp ?? 0),
    evasion: left.evasion + (right.evasion ?? 0),
    critChance: left.critChance + (right.critChance ?? 0),
    critDamage: left.critDamage + (right.critDamage ?? 0),
    threat: left.threat + (right.threat ?? 0)
  };
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

function normalizePercentStat(value: number): number {
  return value > 0 && value < 1 ? value * 100 : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
