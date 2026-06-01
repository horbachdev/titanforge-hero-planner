import rawGameData from '../data/generated/game-data.json';
import { getStarforgeStatMultiplier } from './engine';
import type { GameData } from './types';

const data = rawGameData as GameData;

describe('generated game data', () => {
  it('contains the MVP source tabs and metadata', () => {
    expect(data.metadata.officialSpreadsheetVersion).toContain('v26.5.0');
    expect(data.metadata.ressSpreadsheetVersion).toBe('V9.4');
    expect(data.metadata.tabs).toEqual(
      expect.arrayContaining(['Blueprints', 'Heroes', 'Hero Levels', 'Skills', 'Quests', 'Enchantments'])
    );
  });

  it('imports the core entity sets', () => {
    expect(data.heroes.length).toBeGreaterThan(30);
    expect(data.items.length).toBeGreaterThan(1000);
    expect(data.skills.length).toBeGreaterThan(500);
    expect(data.enchantments.length).toBeGreaterThan(50);
    expect(data.quests.length).toBeGreaterThan(80);
  });

  it('keeps Starforged stat milestones on items', () => {
    const starforgedStatItems = data.items.filter((item) => getStarforgeStatMultiplier(item) > 1);
    expect(starforgedStatItems.length).toBeGreaterThan(500);
    expect(starforgedStatItems[0].starforgedMilestones.map((entry) => entry.description)).toContain(
      '+25% Base ATK, DEF and HP'
    );
  });
});
