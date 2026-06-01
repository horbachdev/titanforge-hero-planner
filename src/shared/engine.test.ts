import rawGameData from '../data/generated/game-data.json';
import { parseBuildJson, serializeBuild } from './build-io';
import { emptyEquipmentForHero } from './data-utils';
import { calculateHeroStats } from './engine';
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

  it('applies champion leader skills to the resolved hero', () => {
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
      championSkillId: '',
      level: 40,
      seeds: { attack: 0, defense: 0, hp: 0 },
      skills: ['', '', '', ''],
      equipment: emptyEquipmentForHero(soldier!)
    };

    const withoutChampion = calculateHeroStats(build, data);
    const withChampion = calculateHeroStats({ ...build, championSkillId: championSkill!.id }, data);

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
