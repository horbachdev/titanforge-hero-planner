import rawGameData from '../data/generated/game-data.json';
import { getStarforgeStatMultiplier } from './engine';
import type { GameData } from './types';

const data = rawGameData as GameData;

describe('generated game data', () => {
  it('contains the MVP source tabs and metadata', () => {
    expect(data.metadata.officialSpreadsheetVersion).toContain('v26.5.0');
    expect(data.metadata.ressSpreadsheetVersion).toBe('V9.4');
    expect(data.metadata.tabs).toEqual(
      expect.arrayContaining(['Blueprints', 'Heroes', 'Hero Levels', 'Skills', 'Champions', 'Quests', 'Enchantments'])
    );
  });

  it('imports the core entity sets', () => {
    expect(data.heroes.length).toBeGreaterThan(30);
    expect(data.items.length).toBeGreaterThan(1000);
    expect(data.skills.length).toBeGreaterThan(500);
    expect(data.champions.length).toBeGreaterThan(10);
    expect(data.enchantments.length).toBeGreaterThan(50);
    expect(data.quests.length).toBeGreaterThan(80);
  });

  it('links base classes to promotions and innate skills', () => {
    const soldier = data.heroes.find((hero) => hero.id === 'soldier');
    expect(soldier?.promotedClassId).toBe('mercenary-soldier-class-promotion');
    expect(soldier?.innateSkillIds).toContain('martial-master');
  });

  it('imports champion base stats and rank rewards from the Champions tab', () => {
    const argon = data.champions.find((champion) => champion.id === 'argon');
    expect(argon?.baseStats.attack).toBe(50);
    expect(argon?.element).toBe('Light');
    expect(argon?.unlockCost).toBe('FREE');
    expect(argon?.prerequisite).toBe('Merchant Lv. 1');
    expect(argon?.rankRewards).toHaveLength(12);
    expect(argon?.rankRewards.find((reward) => reward.rank === 11)?.leaderSkillId).toBe('aura-of-the-paladin');
    expect(argon?.rankRewards.find((reward) => reward.repeatable)?.rankLabel).toBe('11 (+X)');
  });

  it('keeps Starforged stat milestones on items', () => {
    const starforgedStatItems = data.items.filter((item) => getStarforgeStatMultiplier(item) > 1);
    expect(starforgedStatItems.length).toBeGreaterThan(500);
    expect(starforgedStatItems[0].starforgedMilestones.map((entry) => entry.description)).toContain(
      '+25% Base ATK, DEF and HP'
    );
  });

  it('normalizes imported item crit and evasion as visible percentage points', () => {
    const percentageItems = data.items.filter((item) => item.stats.critChance > 0 || item.stats.evasion > 0);
    expect(percentageItems.length).toBeGreaterThan(50);
    expect(
      Math.min(...percentageItems.map((item) => Math.max(item.stats.critChance, item.stats.evasion)))
    ).toBeGreaterThanOrEqual(1);
  });
});
