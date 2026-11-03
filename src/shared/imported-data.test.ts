import rawGameData from '../data/generated/game-data.json';
import { validateGameData } from './data/validate';
import { getStarforgeStatMultiplier } from './engine';
import type { GameData } from './types';

const data = rawGameData as unknown as GameData;

describe('generated game data', () => {
  it('contains the MVP source tabs and metadata', () => {
    // The data is refreshed automatically, so pin the format, not a version.
    expect(data.metadata.officialSpreadsheetVersion).toMatch(/^client v\d+\.\d+\.\d+ \/ spreadsheet v[\d.]+$/);
    expect(data.metadata.ressSpreadsheetVersion).toMatch(/^V\d+(\.\d+)*$/);
    expect(data.metadata.tabs).toEqual(
      expect.arrayContaining(['Blueprints', 'Heroes', 'Hero Levels', 'Skills', 'Champions', 'Quests', 'Enchantments'])
    );
  });

  it('passes the same validation the importer and remote sources use', () => {
    const report = validateGameData(data);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('imports the core entity sets', () => {
    expect(data.heroes.length).toBeGreaterThan(30);
    expect(data.items.length).toBeGreaterThan(1000);
    expect(data.skills.length).toBeGreaterThan(500);
    expect(data.champions.length).toBeGreaterThan(10);
    expect(data.enchantments.length).toBeGreaterThan(50);
    expect(data.quests.length).toBeGreaterThan(80);
  });

  it('enriches quests with Ress combat metadata', () => {
    const sunGodTomb = data.quests.find((quest) => quest.id === 'sun-god-s-tomb-normal-easy');
    expect(sunGodTomb?.defenseCap).toBe(12000);
    expect(sunGodTomb?.aoeDamage).toBe(20);
    expect(sunGodTomb?.aoeChance).toBe(25);
    expect(sunGodTomb?.lcog).toBe(false);

    const lcogQuest = data.quests.find((quest) => quest.zone === 'Lost City Of Gold Diff 7' && quest.difficulty === 'Easy');
    expect(lcogQuest?.lcog).toBe(true);
    expect(lcogQuest?.partySize).toBe(5);
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
