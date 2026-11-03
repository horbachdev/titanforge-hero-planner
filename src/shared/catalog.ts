import type { EnchantmentData, GameData, HeroData, ItemData, QuestData, SkillData } from './types';

/**
 * Catalog helpers shared by the UI and the planner API: who can use which
 * skill, how quests and zones are labelled, built-in enchantments, …
 */

/** Skills a hero can slot (excludes leader and innate skills). */
export function skillsForHero(data: GameData, hero: HeroData | null | undefined): SkillData[] {
  if (!hero) {
    return [];
  }
  return data.skills
    .filter((skill) => skill.type !== 'Leader' && skill.type !== 'Innate')
    .filter((skill) => !skill.requiresPromotion || hero.promoted)
    .filter((skill) => skill.classes.length === 0 || skill.classes.some((entry) => skillClassMatches(entry, hero)));
}

function skillClassMatches(classLabel: string, hero: HeroData): boolean {
  const label = classLabel.toLowerCase();
  if (label === 'all classes' || label === 'all') {
    return true;
  }
  if (label.includes(hero.name.toLowerCase()) || label.includes(hero.baseClassName.toLowerCase())) {
    return true;
  }
  return (
    (label.includes('all fighter') && hero.role === 'fighter') ||
    (label.includes('all rogue') && hero.role === 'rogue') ||
    (label.includes('all spellcaster') && hero.role === 'spellcaster')
  );
}

/** "HOWLING WOODS" → "Howling Woods", "SUN GOD'S TOMB" → "Sun God's Tomb". */
export function formatZone(zone: string): string {
  return zone
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (/^(of|the)$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('')
    .replace(/^./, (char) => char.toUpperCase())
    .replace(/\(titan\)/i, '(Titan)');
}

export function questLabel(quest: QuestData): string {
  return `${formatZone(quest.zone)} · ${quest.type === 'Boss' ? 'Boss · ' : ''}${quest.difficulty}`;
}

export type ZoneGroup = 'Zones' | 'Bosses' | 'Lost City of Gold' | 'Towers' | 'Events & Specials';

export interface QuestZone {
  key: string;
  zone: string;
  label: string;
  group: ZoneGroup;
  /** Quest variants in display order (Normal before Boss, Easy → Extreme). */
  quests: QuestData[];
}

const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard', 'Extreme'];

/** Groups quests by zone so pickers can show "zone + difficulty" instead of 244 rows. */
export function questZones(data: GameData): QuestZone[] {
  const zones = new Map<string, QuestZone>();
  data.quests.forEach((quest) => {
    const key = quest.zone.toLowerCase();
    if (!zones.has(key)) {
      zones.set(key, { key, zone: quest.zone, label: formatZone(quest.zone), group: zoneGroup(quest, data), quests: [] });
    }
    zones.get(key)!.quests.push(quest);
  });
  for (const zone of zones.values()) {
    zone.quests.sort(
      (left, right) =>
        (left.type === 'Boss' ? 1 : 0) - (right.type === 'Boss' ? 1 : 0) ||
        DIFFICULTY_ORDER.indexOf(left.difficulty) - DIFFICULTY_ORDER.indexOf(right.difficulty)
    );
  }
  return [...zones.values()];
}

function zoneGroup(quest: QuestData, data: GameData): ZoneGroup {
  if (/lost city of gold/i.test(quest.zone)) {
    return 'Lost City of Gold';
  }
  if (/tower/i.test(quest.zone)) {
    return 'Towers';
  }
  const hasNormal = data.quests.some((entry) => entry.zone === quest.zone && entry.type === 'Normal');
  if (hasNormal) {
    return 'Zones';
  }
  return quest.isBoss && quest.powerRequirement > 0 ? 'Bosses' : 'Events & Specials';
}

export function normalizeEnchantmentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\(.+?\)/g, '')
    .replace(/\b(element|spirit)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function findBuiltInEnchantment(
  data: GameData,
  item: ItemData | undefined,
  type: 'Element' | 'Spirit'
): EnchantmentData | undefined {
  const name = type === 'Element' ? item?.builtInElement : item?.builtInSpirit;
  const normalized = normalizeEnchantmentName(name ?? '');
  if (!normalized) {
    return undefined;
  }
  return data.enchantments.find((entry) => entry.type === type && normalizeEnchantmentName(entry.name) === normalized);
}
