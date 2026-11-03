import rawGameData from '../../data/generated/game-data.json';
import { GameRepository } from '../data/repository';
import { simulateTeam } from '../team';
import type { GameData } from '../types';
import { createPlannerApi, PlannerError, type HeroInput } from './planner';

const data = rawGameData as unknown as GameData;
const api = createPlannerApi(new GameRepository(data));

const tank: HeroInput = {
  name: 'Tank',
  heroClass: 'soldier',
  level: 40,
  gear: [
    { item: 'Kiku-Ichimonji', quality: 'epic', element: 'Inferno', spirit: 'wolf' },
    { slot: 6, item: 'gaia aegis', quality: 'superior' }
  ]
};

describe('planner API', () => {
  it('describes the loaded data', () => {
    const info = api.getDataInfo();
    expect(info.gameVersion).toMatch(/^client v/);
    expect(info.counts.items).toBeGreaterThan(1000);
  });

  it('evaluates a hero from forgiving input and reports interpretations', () => {
    const result = api.evaluateHero({ ...tank, heroClass: 'Mercenary' });
    expect(result.class).toBe('Mercenary');
    expect(result.build.heroClassId).toBe('soldier');
    expect(result.build.promoted).toBe(true);
    expect(result.build.equipment[0].itemId).toBe('kiku-ichimonji');
    expect(result.build.equipment[0].elementId).toBe('inferno-element');
    // Trivial completions ("wolf" → "Wolf Spirit") stay quiet; real guesses are reported.
    expect(result.notes).toEqual([]);
    const partial = api.evaluateHero({ heroClass: 'Soldier', gear: [{ item: 'kiku' }] });
    expect(partial.notes).toEqual(['Interpreted item "kiku" as "Kiku-Ichimonji".']);
    expect((result.stats as Record<string, number>).attack).toBeGreaterThan(0);
  });

  it('refuses gear the class cannot equip, with a helpful message', () => {
    expect(() => api.evaluateHero({ heroClass: 'Mage', gear: [{ item: 'Kiku-Ichimonji' }] })).toThrowError(/accepts/);
  });

  it('returns suggestions for unknown or ambiguous names', () => {
    try {
      api.evaluateHero({ heroClass: 'Soldjer' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PlannerError);
      expect((error as PlannerError).code).toBe('not_found');
    }

    try {
      api.evaluateHero({ heroClass: 'Soldier', gear: [{ item: 'sword' }] });
      expect.unreachable();
    } catch (error) {
      expect((error as PlannerError).code).toBe('ambiguous');
      expect((error as PlannerError).suggestions.length).toBeGreaterThan(1);
    }
  });

  it('simulates a quest by zone + difficulty and matches the shared pipeline exactly', () => {
    const summary = api.simulateQuest({
      heroes: [tank, { heroClass: 'Mage', level: 40 }, { heroClass: 'Cleric', level: 40 }],
      champion: { champion: 'Argon' },
      quest: { zone: 'Howling Woods', difficulty: 'Easy' },
      runs: 1000
    });
    expect(summary.quest.id).toBe('howling-woods-normal-easy');
    expect(summary.units).toHaveLength(4);
    expect(summary.verdict.winRate).toBeGreaterThanOrEqual(0);
    expect(summary.notes.some((note) => note.includes('Boss'))).toBe(true);

    // Same builds through the UI's code path → same numbers.
    const evaluated = api.evaluateTeam({
      heroes: [tank, { heroClass: 'Mage', level: 40 }, { heroClass: 'Cleric', level: 40 }],
      champion: { champion: 'Argon' }
    });
    const direct = simulateTeam(
      { heroes: evaluated.builds.heroes, champion: evaluated.builds.champion, questId: 'howling-woods-normal-easy', runs: 1000 },
      data
    );
    expect(summary.verdict.winRate).toBeCloseTo(direct.simulation.successRate, 5);
  });

  it('accepts builds exported from the app', () => {
    const exported = api.evaluateHero(tank).build;
    const again = api.evaluateHero(exported);
    expect(again.stats).toEqual(api.evaluateHero(tank).stats);
  });

  it('scans all difficulties of a zone', () => {
    const scan = api.scanDifficulties({ heroes: [tank], zone: 'howling woods', runs: 200 });
    expect(scan.results.map((entry) => entry.difficulty)).toEqual(['Easy', 'Medium', 'Hard', 'Extreme']);
  });

  it('searches items a class can use', () => {
    const result = api.search({ kind: 'item', query: 'kiku', heroClass: 'Samurai' });
    expect(result.results).toEqual([expect.objectContaining({ id: 'kiku-ichimonji' })]);
  });
});
