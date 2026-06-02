import rawGameData from '../data/generated/game-data.json';
import { parseBuildJson, serializeBuild } from './build-io';
import { defaultChampionBuild, emptyEquipmentForHero } from './data-utils';
import { calculateChampionBuildStats, calculateHeroStats, resolveGearLine } from './engine';
import type { BuildConfig, GameData } from './types';

const data = rawGameData as GameData;

describe('calculateHeroStats', () => {
  it('uses promoted hero data when the Titan Soul toggle is on', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    expect(soldier).toBeDefined();

    const baseBuild: BuildConfig = {
      schemaVersion: 1,
      id: 'promote-test',
      name: 'Promote Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 40,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(soldier!)
    };

    const regular = calculateHeroStats(baseBuild, data);
    const promoted = calculateHeroStats({ ...baseBuild, promoted: true }, data);

    expect(regular.hero?.name).toBe('Soldier');
    expect(promoted.hero?.name).toBe('Mercenary');
    expect(promoted.stats.attack).toBeGreaterThan(regular.stats.attack);
    expect(promoted.innateSkills[0]?.name).toBe('Sellsword Lord');
  });

  it('applies champion leader skills through roster context', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    const championSkill = data.skills.find((skill) => skill.id === 'aura-of-the-paladin');
    expect(soldier).toBeDefined();
    expect(championSkill).toBeDefined();

    const build: BuildConfig = {
      schemaVersion: 1,
      id: 'champion-test',
      name: 'Champion Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 40,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(soldier!)
    };

    const withoutChampion = calculateHeroStats(build, data);
    const withChampion = calculateHeroStats(build, data, { championSkillId: championSkill!.id });

    expect(withChampion.championSkill?.name).toBe('Aura of the Paladin');
    expect(withChampion.stats.attack).toBeGreaterThan(withoutChampion.stats.attack);
    expect(withChampion.stats.defense).toBeGreaterThan(withoutChampion.stats.defense);
  });

  it('applies built-in elements and affinity bonuses to item end stats', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    const builtInItem = data.items.find((item) => item.name === 'Arboreal Blade');
    const affinityItem = data.items.find((item) => item.name === "Hero's Sword");
    const lightElement = data.enchantments.find((enchantment) => enchantment.name === 'Apotheosis Element');
    expect(soldier).toBeDefined();
    expect(builtInItem).toBeDefined();
    expect(affinityItem).toBeDefined();
    expect(lightElement).toBeDefined();

    const baseEquipment = emptyEquipmentForHero(soldier!);
    const builtInBuild: BuildConfig = {
      schemaVersion: 1,
      id: 'built-in-test',
      name: 'Built-in Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 50,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: baseEquipment.map((entry) =>
        entry.slotId === 'slot-1' ? { ...entry, itemId: builtInItem!.id } : entry
      )
    };
    const builtIn = calculateHeroStats(builtInBuild, data).gear.find((line) => line.itemId === builtInItem!.id);
    expect(builtIn?.elementSources.join(' ')).toContain('Nature Element built-in');
    expect(builtIn!.stats.attack).toBeGreaterThan(builtIn!.baseStats.attack);

    const affinityBuild: BuildConfig = {
      ...builtInBuild,
      id: 'affinity-test',
      equipment: baseEquipment.map((entry) =>
        entry.slotId === 'slot-1' ? { ...entry, itemId: affinityItem!.id, elementId: lightElement!.id } : entry
      )
    };
    const affinity = calculateHeroStats(affinityBuild, data).gear.find((line) => line.itemId === affinityItem!.id);
    expect(affinity?.affinityBonuses.join(' ')).toContain('affinity');
  });

  it('does not apply selected enchants or affinity bonuses to built-in elements', () => {
    const item = data.items.find((entry) => entry.name === 'Arboreal Blade');
    const natureElement = data.enchantments.find((entry) => entry.name === 'Nature Element');
    const lightElement = data.enchantments.find((entry) => entry.name === 'Apotheosis Element');
    expect(item).toBeDefined();
    expect(natureElement).toBeDefined();
    expect(lightElement).toBeDefined();

    const itemWithAffinity = {
      ...item!,
      elementalAffinity: 'Earth'
    };
    const builtInLine = resolveGearLine(itemWithAffinity, 'normal', false, lightElement!.id, '', data);
    const nativeElementScore = Object.values(natureElement!.elementScores).reduce((total, score) => total + score, 0);

    expect(Object.values(builtInLine.elementScores).reduce((total, score) => total + score, 0)).toBe(nativeElementScore);
    expect(builtInLine.elementSources).toContain('Nature Element built-in');
    expect(builtInLine.elementSources).not.toContain(lightElement!.name);
    expect(builtInLine.affinityBonuses.join(' ')).not.toContain('affinity');
  });

  it('recognizes built-in conditional spirits without applying static boss-only modifiers', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    const item = data.items.find((entry) => entry.id === 'mundra-s-masher');
    expect(soldier).toBeDefined();
    expect(item).toBeDefined();

    const build: BuildConfig = {
      schemaVersion: 1,
      id: 'built-in-spirit-test',
      name: 'Built-in Spirit Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 50,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(soldier!).map((entry) =>
        entry.slotId === 'slot-1' ? { ...entry, itemId: item!.id } : entry
      )
    };

    const withoutBuiltInSpirit: GameData = {
      ...data,
      items: data.items.map((entry) => (entry.id === item!.id ? { ...entry, builtInSpirit: '' } : entry))
    };
    const withSpirit = calculateHeroStats(build, data);
    const withoutSpirit = calculateHeroStats(build, withoutBuiltInSpirit);
    const gearLine = withSpirit.gear.find((line) => line.itemId === item!.id);

    expect(gearLine?.spiritSources).toContain("Mundra's Spirit built-in");
    expect(withSpirit.stats.attack).toBe(withoutSpirit.stats.attack);
  });

  it('applies Ress spirit stats and doubles them on idol/totem slots', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    const sword = data.items.find((entry) => entry.name === "Hero's Sword");
    const idol = data.items.find((entry) => entry.type === 'Idol');
    const leviathan = data.enchantments.find((entry) => entry.name === 'Leviathan Spirit');
    const titan = data.enchantments.find((entry) => entry.name === 'Titan Spirit');
    expect(soldier).toBeDefined();
    expect(sword).toBeDefined();
    expect(idol).toBeDefined();
    expect(leviathan).toBeDefined();
    expect(titan).toBeDefined();

    const baseEquipment = emptyEquipmentForHero(soldier!);
    const baseBuild: BuildConfig = {
      schemaVersion: 1,
      id: 'spirit-test',
      name: 'Spirit Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 50,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: baseEquipment.map((entry) =>
        entry.slotId === 'slot-1' ? { ...entry, itemId: sword!.id } : entry
      )
    };

    const withoutSpirit = calculateHeroStats(baseBuild, data);
    const withSpirit = calculateHeroStats(
      {
        ...baseBuild,
        equipment: baseBuild.equipment.map((entry) =>
          entry.slotId === 'slot-1' ? { ...entry, spiritId: leviathan!.id } : entry
        )
      },
      data
    );
    const idolLine = resolveGearLine(idol!, 'normal', false, '', titan!.id, data);

    expect(withSpirit.stats.attack).toBeGreaterThan(withoutSpirit.stats.attack);
    expect(withSpirit.stats.critChance - withoutSpirit.stats.critChance).toBe(3);
    expect(idolLine.spiritModifiers.hp).toBe(0.3);
    expect(idolLine.affinityBonuses.join(' ')).toContain('x2 spirit effect');
  });

  it('does not apply selected spirits or matched affinity to built-in spirits', () => {
    const sword = data.items.find((entry) => entry.name === "Hero's Sword");
    const titan = data.enchantments.find((entry) => entry.name === 'Titan Spirit');
    const wolf = data.enchantments.find((entry) => entry.name === 'Wolf Spirit');
    expect(sword).toBeDefined();
    expect(titan).toBeDefined();
    expect(wolf).toBeDefined();

    const builtInSpiritItem = {
      ...sword!,
      spiritAffinity: 'Titan Solemnity',
      builtInSpirit: 'Titan Spirit'
    };
    const builtInLine = resolveGearLine(builtInSpiritItem, 'normal', false, '', wolf!.id, data);
    const selectedLine = resolveGearLine({ ...builtInSpiritItem, builtInSpirit: '' }, 'normal', false, '', titan!.id, data);

    expect(builtInLine.spiritSources).toContain('Titan Spirit built-in');
    expect(builtInLine.spiritSources).not.toContain('Wolf Spirit');
    expect(builtInLine.spiritModifiers.hp).toBe(0.15);
    expect(builtInLine.spiritModifiers.attack).toBe(0);
    expect(builtInLine.affinityBonuses.join(' ')).not.toContain('Ress matched spirit columns');
    expect(selectedLine.spiritModifiers.hp).toBe(0.2);
  });

  it('normalizes imported item crit and evasion percentages as percentage points', () => {
    const critItem = data.items.find((entry) => entry.stats.critChance > 0);
    expect(critItem).toBeDefined();
    expect(critItem!.stats.critChance).toBeGreaterThanOrEqual(1);

    const resolvedLine = resolveGearLine(critItem!, 'normal', false, '', '', data);
    expect(resolvedLine.stats.critChance).toBe(critItem!.stats.critChance);
  });

  it('applies per-item Starforge stat milestones when toggled', () => {
    const mage = data.heroes.find((hero) => hero.id === 'mage');
    const item = data.items.find((entry) => entry.id === 'avatar-core');
    expect(mage).toBeDefined();
    expect(item).toBeDefined();

    const slot = mage!.slots.find((entry) => entry.allowedTypes.includes(item!.type));
    expect(slot).toBeDefined();

    const baseBuild: BuildConfig = {
      schemaVersion: 1,
      id: 'test-mage',
      name: 'Mage Starforge Test',
      heroClassId: mage!.id,
      promoted: false,
      level: 50,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(mage!).map((entry) =>
        entry.slotId === slot!.id ? { ...entry, itemId: item!.id, quality: 'normal' } : entry
      )
    };

    const regular = calculateHeroStats(baseBuild, data);
    const starforged = calculateHeroStats(
      {
        ...baseBuild,
        equipment: baseBuild.equipment.map((entry) =>
          entry.slotId === slot!.id ? { ...entry, starforged: true } : entry
        )
      },
      data
    );

    expect(starforged.stats.defense).toBeGreaterThan(regular.stats.defense);
    expect(starforged.stats.hp).toBeGreaterThan(regular.stats.hp);
  });

  it('calculates champion build stats with Champion Soul and Ress seed scaling', () => {
    const baseBuild = { ...defaultChampionBuild(data), championSoul: false, seeds: { attack: 0, defense: 0, hp: 0 } };
    const regular = calculateChampionBuildStats(baseBuild, data);
    const seeded = calculateChampionBuildStats(
      { ...baseBuild, seeds: { attack: 1, defense: 1, hp: 1 } },
      data
    );
    const souled = calculateChampionBuildStats({ ...baseBuild, championSoul: true }, data);

    expect(seeded.stats.attack - regular.stats.attack).toBe(4);
    expect(seeded.stats.defense - regular.stats.defense).toBe(4);
    expect(seeded.stats.hp - regular.stats.hp).toBe(1);
    expect(souled.stats.attack).toBeGreaterThan(regular.stats.attack);
  });

  it('applies parsed skill attack modifiers', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    const cleave = data.skills.find((skill) => skill.id === 'cleave');
    expect(soldier).toBeDefined();
    expect(cleave?.modifiers.attack).toBeGreaterThan(0);

    const baseBuild: BuildConfig = {
      schemaVersion: 1,
      id: 'test-soldier',
      name: 'Soldier Skill Test',
      heroClassId: soldier!.id,
      promoted: false,
      level: 35,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(soldier!)
    };

    const withoutSkill = calculateHeroStats(baseBuild, data);
    const withSkill = calculateHeroStats({ ...baseBuild, skills: [cleave!.id, '', '', ''] }, data);

    expect(withSkill.stats.attack).toBeGreaterThan(withoutSkill.stats.attack);
  });

  it('round-trips schema v1 build JSON', () => {
    const build: BuildConfig = {
      schemaVersion: 1,
      id: 'round-trip',
      name: 'Round Trip',
      heroClassId: 'soldier',
      promoted: false,
      level: 12,
      seeds: { attack: 1, defense: 2, hp: 3 },
      skills: ['', '', '', ''],
      equipment: []
    };

    const parsed = parseBuildJson(serializeBuild(build), data);
    expect(Array.isArray(parsed)).toBe(false);
    expect((parsed as BuildConfig).name).toBe('Round Trip');
  });
});
