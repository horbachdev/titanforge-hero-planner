import type { BuildConfig, EquipmentSelection, GameData, HeroData, HeroSlot, ItemQuality } from './types';

export const QUALITY_MULTIPLIERS: Record<ItemQuality, number> = {
  normal: 1,
  superior: 1.25,
  flawless: 1.5,
  epic: 2,
  legendary: 3
};

export const QUALITY_LABELS: Record<ItemQuality, string> = {
  normal: 'Normal',
  superior: 'Superior',
  flawless: 'Flawless',
  epic: 'Epic',
  legendary: 'Legendary'
};

export const ITEM_QUALITIES = Object.keys(QUALITY_LABELS) as ItemQuality[];

export function createId(prefix: string): string {
  const entropy = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${entropy}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getHero(data: GameData, heroClassId: string): HeroData | undefined {
  return data.heroes.find((hero) => hero.id === heroClassId);
}

export function getMaxTierForLevel(data: GameData, level: number): number {
  const sorted = [...data.heroLevels].sort((a, b) => a.level - b.level);
  let maxTier = sorted[0]?.maxItemTier ?? 1;
  for (const row of sorted) {
    if (row.level <= level) {
      maxTier = row.maxItemTier;
    }
  }
  return maxTier;
}

export function emptyEquipmentForHero(hero: HeroData): EquipmentSelection[] {
  return hero.slots.map((slot) => ({
    slotId: slot.id,
    itemId: '',
    quality: 'normal',
    elementId: '',
    spiritId: '',
    starforged: false
  }));
}

export function normalizeEquipmentForHero(build: BuildConfig, hero: HeroData): EquipmentSelection[] {
  const existingBySlot = new Map(build.equipment.map((selection) => [selection.slotId, selection]));
  return hero.slots.map((slot) => ({
    slotId: slot.id,
    itemId: existingBySlot.get(slot.id)?.itemId ?? '',
    quality: existingBySlot.get(slot.id)?.quality ?? 'normal',
    elementId: existingBySlot.get(slot.id)?.elementId ?? '',
    spiritId: existingBySlot.get(slot.id)?.spiritId ?? '',
    starforged: existingBySlot.get(slot.id)?.starforged ?? false
  }));
}

export function defaultBuild(data: GameData): BuildConfig {
  const hero = data.heroes[0];
  return {
    schemaVersion: 1,
    id: createId('build'),
    name: 'New Build',
    heroClassId: hero?.id ?? '',
    promoted: hero?.promoted ?? false,
    level: 40,
    seeds: {
      attack: 0,
      defense: 0,
      hp: 0
    },
    skills: ['', '', '', ''],
    equipment: hero ? emptyEquipmentForHero(hero) : []
  };
}

export function slotLabel(slot: HeroSlot): string {
  const uniqueTypes = [...new Set(slot.allowedTypes)].slice(0, 3);
  return uniqueTypes.length > 0 ? `${slot.label}: ${uniqueTypes.join(' / ')}` : slot.label;
}
