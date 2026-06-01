import rawGameData from '../data/generated/game-data.json';
import { parseBuildJson, serializeBuild } from './build-io';
import { emptyEquipmentForHero } from './data-utils';
import { calculateHeroStats } from './engine';
import type { BuildConfig, GameData } from './types';

const data = rawGameData as GameData;

describe('calculateHeroStats', () => {
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
