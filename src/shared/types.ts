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
  element: string;
  prerequisite: string;
  baseStats: StatBlock;
  slots: HeroSlot[];
  skillUnlocks: string[];
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
  barrierType: string;
  barrierHealth: number;
}

export interface GameData {
  metadata: SourceMetadata;
  heroes: HeroData[];
  heroLevels: HeroLevelData[];
  items: ItemData[];
  skills: SkillData[];
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

export interface ResolvedGearLine {
  slotId: string;
  slotLabel: string;
  itemName: string;
  quality: ItemQuality;
  starforged: boolean;
  stats: ItemStats;
  warnings: string[];
}

export interface ResolvedBuild {
  build: BuildConfig;
  hero: HeroData | null;
  stats: StatBlock;
  modifiers: PercentModifiers;
  warnings: string[];
  gear: ResolvedGearLine[];
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
