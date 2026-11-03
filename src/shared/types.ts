export type HeroRole = 'fighter' | 'rogue' | 'spellcaster' | 'champion' | 'unknown';

export type StatKey =
  | 'attack'
  | 'defense'
  | 'hp'
  | 'evasion'
  | 'critChance'
  | 'critDamage'
  | 'threat'
  | 'power';

export interface StatBlock {
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
  critDamage: number;
  threat: number;
  power: number;
}

export interface PercentModifiers {
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
  critDamage: number;
}

export interface FlatStatModifiers {
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
  critDamage: number;
  threat: number;
}

export interface SourceMetadata {
  generatedAt: string;
  officialSpreadsheetId: string;
  officialSpreadsheetVersion: string;
  ressSpreadsheetId: string;
  ressSpreadsheetVersion: string;
  tabs: string[];
}

export interface HeroSlot {
  id: string;
  label: string;
  allowedTypes: string[];
}

export interface HeroData {
  id: string;
  name: string;
  role: HeroRole;
  promoted: boolean;
  baseClassId: string;
  baseClassName: string;
  promotedClassId: string;
  promotedClassName: string;
  element: string;
  prerequisite: string;
  baseStats: StatBlock;
  slots: HeroSlot[];
  skillUnlocks: string[];
  innateSkillIds: string[];
}

export interface HeroLevelData {
  level: number;
  xpNeeded: number;
  maxItemTier: number;
}

export interface ItemStats {
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  critChance: number;
}

export interface ItemUpgrade {
  description: string;
  unlockCount: number;
}

export interface ItemData {
  id: string;
  name: string;
  type: string;
  tier: number;
  value: number;
  stats: ItemStats;
  elementalAffinity: string;
  spiritAffinity: string;
  builtInElement: string;
  builtInSpirit: string;
  craftingUpgrades: ItemUpgrade[];
  starforgedMilestones: ItemUpgrade[];
  ascensionUpgrades: ItemUpgrade[];
}

export interface EnchantmentData {
  id: string;
  name: string;
  type: 'Element' | 'Spirit' | string;
  elementScores: Record<string, number>;
}

export type ElementScores = Record<string, number>;

export interface SkillData {
  id: string;
  name: string;
  type: string;
  tier: number;
  rarity: string;
  effect: string;
  classes: string[];
  requiresPromotion: boolean;
  modifiers: PercentModifiers;
  flatStats: FlatStatModifiers;
}

export interface ChampionRankReward {
  rank: number;
  rankLabel: string;
  coinsNeeded: number;
  coinsFormula: string;
  reward: string;
  statGains: FlatStatModifiers;
  leaderSkillId: string;
  repeatable: boolean;
}

export interface ChampionElementBreakpoint {
  rank: number;
  elementValue: number;
}

export interface ChampionData {
  id: string;
  name: string;
  guest: boolean;
  role: HeroRole;
  element: string;
  unlockCost: string;
  prerequisite: string;
  baseStats: StatBlock;
  leaderSkillIds: string[];
  rankRewards: ChampionRankReward[];
  elementBreakpoints: ChampionElementBreakpoint[];
}

export interface QuestData {
  id: string;
  zone: string;
  difficulty: string;
  type: string;
  partySize: number;
  powerRequirement: number;
  enemyDamage: number;
  enemyHealth: number;
  defenseCap: number;
  aoeDamage: number;
  aoeChance: number;
  lcog: boolean;
  isBoss: boolean;
  isExtreme: boolean;
  barrierType: string;
  barrierOptions: string[];
  barrierHealth: number;
}

/**
 * Old → new id mappings for entities that were renamed upstream, so saved
 * builds keep working after a data refresh. Optional for older data files.
 */
export interface GameDataAliases {
  items?: Record<string, string>;
  skills?: Record<string, string>;
  heroes?: Record<string, string>;
  champions?: Record<string, string>;
  quests?: Record<string, string>;
}

export interface GameData {
  metadata: SourceMetadata;
  aliases?: GameDataAliases;
  heroes: HeroData[];
  heroLevels: HeroLevelData[];
  items: ItemData[];
  skills: SkillData[];
  champions: ChampionData[];
  enchantments: EnchantmentData[];
  quests: QuestData[];
}

export type ItemQuality = 'normal' | 'superior' | 'flawless' | 'epic' | 'legendary';

export interface SeedConfig {
  attack: number;
  defense: number;
  hp: number;
}

export interface EquipmentSelection {
  slotId: string;
  itemId: string;
  quality: ItemQuality;
  elementId: string;
  spiritId: string;
  starforged: boolean;
}

export interface BuildConfig {
  schemaVersion: 1;
  id: string;
  name: string;
  heroClassId: string;
  promoted: boolean;
  level: number;
  seeds: SeedConfig;
  skills: string[];
  equipment: EquipmentSelection[];
}

export interface RosterConfig {
  schemaVersion: 1;
  id: string;
  name: string;
  heroBuildIds: Array<string | null>;
  championBuildId: string;
}

export interface ChampionBuildConfig {
  schemaVersion: 1;
  id: string;
  name: string;
  championId: string;
  rank: number;
  level: number;
  powerUps: number;
  championSoul: boolean;
  seeds: SeedConfig;
  familiar: EquipmentSelection;
  aurasong: EquipmentSelection;
}

export interface ResolvedGearLine {
  slotId: string;
  slotLabel: string;
  itemId: string;
  itemName: string;
  itemType: string;
  itemTier: number;
  quality: ItemQuality;
  starforged: boolean;
  baseStats: ItemStats;
  elementStats: ItemStats;
  elementScores: ElementScores;
  spiritModifiers: PercentModifiers;
  spiritFlatStats: FlatStatModifiers;
  stats: ItemStats;
  elementSources: string[];
  spiritSources: string[];
  affinityBonuses: string[];
  warnings: string[];
}

export interface ResolvedBuild {
  build: BuildConfig;
  hero: HeroData | null;
  baseHero: HeroData | null;
  stats: StatBlock;
  modifiers: PercentModifiers;
  flatStats: FlatStatModifiers;
  innateSkills: SkillData[];
  championSkill: SkillData | null;
  warnings: string[];
  gear: ResolvedGearLine[];
  elementScores: ElementScores;
  sourceVersion: string;
}

export interface ResolvedChampion {
  champion: ChampionData;
  rank: number;
  powerUps: number;
  stats: StatBlock;
  leaderSkill: SkillData | null;
  appliedRewards: ChampionRankReward[];
}

export interface ResolvedChampionBuild {
  build: ChampionBuildConfig;
  champion: ChampionData | null;
  stats: StatBlock;
  leaderSkill: SkillData | null;
  gear: ResolvedGearLine[];
  elementScores: ElementScores;
  modifiers: PercentModifiers;
  flatStats: FlatStatModifiers;
  warnings: string[];
  sourceVersion: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ParseOk {
  ok: true;
  build: BuildConfig;
  warnings: ValidationError[];
}

export interface ParseFailed {
  ok: false;
  errors: ValidationError[];
}

export type ParseResult = ParseOk | ParseFailed;
