import fixtures from '../../data/fixtures/combat-simulator-cases.json';
import {
  calculateEnemyCriticalDamageTaken,
  calculateEnemyDamagePerHit,
  calculateExpectedAoeDamage,
  calculateHeroSoloQuestSummary,
  calculateRessEnemyState,
  calculateTargetedHits,
  calculateTotalEnemyHits,
  getHeroSlotLimitForQuest
} from './combat-engine';

type CombatFixture = {
  id: string;
  kind: string;
  description: string;
  sourceCells: string[];
  inputs: Record<string, unknown>;
  expected: Record<string, unknown>;
};

describe('combat simulator Ress parity fixtures', () => {
  const cases = fixtures.cases as CombatFixture[];

  it('documents fixed Ress workbook cases with source cells', () => {
    expect(fixtures.schemaVersion).toBe(1);
    expect(fixtures.source.workbook).toBe('data/raw/ress-hero-quest-simulator.xlsx');
    expect(cases.length).toBeGreaterThanOrEqual(8);

    for (const fixture of cases) {
      expect(fixture.id).toMatch(/^[a-z0-9-]+$/);
      expect(fixture.kind.length).toBeGreaterThan(0);
      expect(fixture.description.length).toBeGreaterThan(0);
      expect(fixture.sourceCells.length).toBeGreaterThan(0);
      expect(Object.keys(fixture.inputs).length).toBeGreaterThan(0);
      expect(Object.keys(fixture.expected).length).toBeGreaterThan(0);

      for (const sourceCell of fixture.sourceCells) {
        expect(sourceCell).toMatch(/^[A-Za-z0-9 ]+![A-Z]+[0-9]+$/);
      }
    }
  });

  it('matches Ress deterministic enemy damage fixtures', () => {
    for (const id of [
      'quest-sim-simple-damage-champion-1',
      'quest-sim-simple-damage-hero-1',
      'quest-sim-simple-damage-empty-slot'
    ]) {
      const fixture = fixtureById(id);
      expect(calculateEnemyDamagePerHit(fixture.inputs as never)).toBe(fixture.expected.damagePerHit);
    }
  });

  it('matches Ress deterministic enemy critical damage fixtures', () => {
    const fixture = fixtureById('hero-1-enemy-critical-damage-taken');
    expect(calculateEnemyCriticalDamageTaken(fixture.inputs as never)).toBe(fixture.expected.criticalDamageTaken);
  });

  it('matches Ress deterministic enemy hit fixtures', () => {
    const totalHits = fixtureById('quest-sim-total-enemy-hits');
    expect(calculateTotalEnemyHits(totalHits.inputs as never)).toBe(totalHits.expected.totalEnemyHits);

    for (const id of ['quest-sim-targeted-hits-champion-1', 'quest-sim-targeted-hits-hero-1']) {
      const fixture = fixtureById(id);
      expect(calculateTargetedHits(fixture.inputs as never)).toBe(fixture.expected.targetedHits);
    }
  });

  it('calculates deterministic expected AoE pressure for quick analysis', () => {
    expect(calculateExpectedAoeDamage({ aoeDamage: 20, aoeChance: 25, totalEnemyHits: 1 })).toBe(5);
    expect(calculateExpectedAoeDamage({ aoeDamage: 80, aoeChance: 25, totalEnemyHits: 8 })).toBe(160);
    expect(calculateExpectedAoeDamage({ aoeDamage: 80, aoeChance: 0, totalEnemyHits: 8 })).toBe(0);
  });

  it('uses the fifth hero slot only for LCoG quests', () => {
    expect(getHeroSlotLimitForQuest({ lcog: true, partySize: 4 })).toBe(5);
    expect(getHeroSlotLimitForQuest({ lcog: false, partySize: 4 })).toBe(4);
    expect(getHeroSlotLimitForQuest({ lcog: false, partySize: 3 })).toBe(3);
  });

  it('applies Ress mini-boss enemy modifiers', () => {
    const baseQuest = {
      id: 'test',
      name: 'Test',
      hp: 1000,
      attack: 100,
      defenseCap: 1000,
      aoeDamage: 25,
      aoeChance: 25,
      lcog: false,
      isBoss: false,
      isExtreme: false,
      barrierType: '',
      barrierHealth: 0
    };

    expect(calculateRessEnemyState({ ...baseQuest, miniBoss: 'Agile' })).toMatchObject({
      hp: 1000,
      attack: 100,
      aoeChance: 25,
      critChance: 10,
      evasion: 40
    });
    expect(calculateRessEnemyState({ ...baseQuest, miniBoss: 'Dire' })).toMatchObject({
      hp: 1500,
      attack: 100,
      aoeChance: 25,
      critChance: 30,
      evasion: -100
    });
    expect(calculateRessEnemyState({ ...baseQuest, miniBoss: 'Huge' })).toMatchObject({
      hp: 2000,
      attack: 100,
      aoeChance: 75,
      critChance: 10,
      evasion: -100
    });
    expect(calculateRessEnemyState({ ...baseQuest, miniBoss: 'Legendary' })).toMatchObject({
      hp: 1500,
      attack: 125,
      aoeChance: 25,
      critChance: 15,
      evasion: 10
    });
  });

  it('matches Ress deterministic Hero 1 solo quest summary formulas', () => {
    const fixture = fixtureById('hero-1-visible-solo-quest-summary');
    const summary = calculateHeroSoloQuestSummary(fixture.inputs as never);

    expect(summary.damageDealt).toBe(fixture.expected.damageDealt);
    expect(summary.damageTaken).toBe(fixture.expected.damageTaken);
    expect(summary.hitsToKillNoCrits).toBe(fixture.expected.hitsToKillNoCrits);
    expect(summary.roundsSurvivedNoCrits).toBe(fixture.expected.roundsSurvivedNoCrits);
    expect(summary.critsSurvivedAndStillWin).toBe(fixture.expected.critsSurvivedAndStillWin);
  });

  for (const fixture of cases.filter((entry) => entry.kind !== 'deterministic-formula')) {
    it.todo(`matches Ress fixture: ${fixture.id}`);
  }

  function fixtureById(id: string): CombatFixture {
    const fixture = cases.find((entry) => entry.id === id);
    expect(fixture).toBeDefined();
    return fixture!;
  }
});
