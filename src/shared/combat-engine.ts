import type { ElementScores, QuestData, StatBlock } from './types';

export interface CombatQuestInput {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defenseCap: number;
  aoeDamage: number;
  aoeChance: number;
  lcog: boolean;
  isBoss: boolean;
  isExtreme: boolean;
  barrierType: string;
  barrierHealth: number;
}

export interface CombatantInput {
  id: string;
  name: string;
  kind: 'hero' | 'champion';
  stats: StatBlock;
  elementScores?: ElementScores;
}

export interface EnemyDamageInput {
  heroDefense: number;
  questAttack: number;
  questDefenseCap: number;
}

export interface TotalEnemyHitsInput {
  questHp: number;
  teamAttackNoCrit: number;
}

export interface TargetedHitsInput {
  targetPercent: number;
  totalEnemyHits: number;
}

export interface SimpleQuestRow {
  combatant: CombatantInput;
  targetPercent: number;
  damagePerHit: number;
  targetedHits: number;
  targetedDamage: number;
  expectedAoeDamage: number;
  totalExpectedDamage: number;
  survives: boolean;
}

export interface SimpleQuestAnalysis {
  quest: CombatQuestInput;
  rows: SimpleQuestRow[];
  teamAttackNoCrit: number;
  totalThreat: number;
  totalEnemyHits: number;
  survivingCombatants: number;
  occupiedCombatants: number;
  simpleSuccess: boolean;
  barrier: BarrierCoverage;
  warnings: string[];
}

export interface BarrierCoverage {
  types: string[];
  required: number;
  available: number;
  met: boolean;
}

export interface HeroSoloQuestSummaryInput {
  heroHp: number;
  heroAttack: number;
  heroDefense: number;
  mobHp: number;
  mobBaseDamage: number;
  mobDefenseCap: number;
  lizardRegen?: number;
}

export interface HeroSoloQuestSummary {
  damageDealt: number;
  damageTaken: number;
  hitsToKillNoCrits: number;
  roundsSurvivedNoCrits: number;
  critsSurvivedAndStillWin: number;
}

export function calculateEnemyDamagePerHit({
  heroDefense,
  questAttack,
  questDefenseCap
}: EnemyDamageInput): number {
  if (questAttack <= 0) {
    return 0;
  }

  if (questDefenseCap <= 0) {
    return roundExcel(1.5 * questAttack);
  }

  if (heroDefense <= questDefenseCap / 6) {
    return roundExcel(linear(heroDefense, 0, questDefenseCap / 6, 1.5 * questAttack, 0.5 * questAttack));
  }

  if (heroDefense <= questDefenseCap / 3) {
    return roundExcel(
      linear(heroDefense, questDefenseCap / 6, questDefenseCap / 3, 0.5 * questAttack, 0.3 * questAttack)
    );
  }

  return roundExcel(
    linear(heroDefense, questDefenseCap / 3, questDefenseCap, 0.3 * questAttack, 0.25 * questAttack)
  );
}

export function calculateTotalEnemyHits({ questHp, teamAttackNoCrit }: TotalEnemyHitsInput): number {
  if (questHp <= 0 || teamAttackNoCrit <= 0) {
    return 0;
  }
  return roundupExcel(questHp / teamAttackNoCrit);
}

export function calculateTargetedHits({ targetPercent, totalEnemyHits }: TargetedHitsInput): number {
  if (targetPercent <= 0 || totalEnemyHits <= 0) {
    return 0;
  }
  return roundupExcel((targetPercent / 100) * totalEnemyHits);
}

export function calculateExpectedAoeDamage({
  aoeDamage,
  aoeChance,
  totalEnemyHits
}: {
  aoeDamage: number;
  aoeChance: number;
  totalEnemyHits: number;
}): number {
  if (aoeDamage <= 0 || aoeChance <= 0 || totalEnemyHits <= 0) {
    return 0;
  }
  return roundExcel(aoeDamage * (aoeChance / 100) * totalEnemyHits);
}

export function getHeroSlotLimitForQuest(quest: Pick<QuestData, 'lcog' | 'partySize'>): number {
  if (quest.lcog) {
    return 5;
  }
  return Math.max(0, Math.min(4, quest.partySize || 4));
}

export function calculateSimpleQuestAnalysis(
  quest: CombatQuestInput,
  combatants: CombatantInput[]
): SimpleQuestAnalysis {
  const activeCombatants = combatants.filter((entry) => entry.stats.hp > 0 || entry.stats.attack > 0 || entry.stats.defense > 0);
  const teamAttackNoCrit = activeCombatants.reduce((total, entry) => total + entry.stats.attack, 0);
  const totalThreat = activeCombatants.reduce((total, entry) => total + Math.max(0, entry.stats.threat), 0);
  const totalEnemyHits = calculateTotalEnemyHits({ questHp: quest.hp, teamAttackNoCrit });
  const warnings: string[] = [];

  if (activeCombatants.length === 0) {
    warnings.push('No roster combatants are available for simulation.');
  }
  if (teamAttackNoCrit <= 0) {
    warnings.push('Team attack is zero; enemy hit count cannot be calculated from Ress simple analysis.');
  }
  if (totalThreat <= 0) {
    warnings.push('Team threat is zero; target distribution is forced to 0%.');
  }

  const rows = activeCombatants.map((combatant) => {
    const targetPercent = totalThreat > 0 ? (Math.max(0, combatant.stats.threat) / totalThreat) * 100 : 0;
    const damagePerHit = calculateEnemyDamagePerHit({
      heroDefense: combatant.stats.defense,
      questAttack: quest.attack,
      questDefenseCap: quest.defenseCap
    });
    const targetedHits = calculateTargetedHits({ targetPercent, totalEnemyHits });
    const targetedDamage = targetedHits * damagePerHit;
    const expectedAoeDamage = calculateExpectedAoeDamage({
      aoeDamage: quest.aoeDamage,
      aoeChance: quest.aoeChance,
      totalEnemyHits
    });
    const totalExpectedDamage = targetedDamage + expectedAoeDamage;
    return {
      combatant,
      targetPercent,
      damagePerHit,
      targetedHits,
      targetedDamage,
      expectedAoeDamage,
      totalExpectedDamage,
      survives: totalExpectedDamage < combatant.stats.hp
    };
  });

  const survivingCombatants = rows.filter((row) => row.survives).length;
  if (quest.aoeDamage > 0 && quest.aoeChance > 0) {
    warnings.push('AoE is included as deterministic expected damage; exact AoE rolls wait for full Monte Carlo parity.');
  }
  warnings.push('Enemy critical hits and evasion are not included until the Ress full-analysis chain is mapped.');
  return {
    quest,
    rows,
    teamAttackNoCrit,
    totalThreat,
    totalEnemyHits,
    survivingCombatants,
    occupiedCombatants: activeCombatants.length,
    simpleSuccess: activeCombatants.length > 0 && rows.every((row) => row.survives),
    barrier: calculateBarrierCoverage(quest, activeCombatants),
    warnings
  };
}

export function calculateHeroSoloQuestSummary(input: HeroSoloQuestSummaryInput): HeroSoloQuestSummary {
  const lizardRegen = input.lizardRegen ?? 0;
  const damageDealt = input.heroAttack;
  const damageTaken = calculateEnemyDamagePerHit({
    heroDefense: input.heroDefense,
    questAttack: input.mobBaseDamage,
    questDefenseCap: input.mobDefenseCap
  });
  const hitsToKillNoCrits = input.mobHp > 0 && damageDealt > 0 ? roundupExcel(input.mobHp / damageDealt) : 0;
  const roundsSurvivedNoCrits = safeRoundup((input.heroHp - damageTaken) / (damageTaken - lizardRegen));
  const criticalDamageTaken = Math.max(damageTaken * 1.5, roundupExcel(1.5 * input.mobBaseDamage));
  const criticalRoundsSurvived = safeRoundup(
    (input.heroHp - criticalDamageTaken) / (criticalDamageTaken - lizardRegen)
  );
  const critsSurvivedAndStillWin =
    criticalRoundsSurvived >= hitsToKillNoCrits
      ? criticalRoundsSurvived
      : rounddownExcel(
          Math.max(
            (input.heroHp - hitsToKillNoCrits * (damageTaken - lizardRegen)) / (criticalDamageTaken - damageTaken),
            0
          )
        );

  return {
    damageDealt,
    damageTaken,
    hitsToKillNoCrits,
    roundsSurvivedNoCrits,
    critsSurvivedAndStillWin
  };
}

export function questToCombatInput(quest: QuestData, defenseCap = estimateQuestDefenseCap(quest)): CombatQuestInput {
  return {
    id: quest.id,
    name: `${titleCase(quest.zone)} ${quest.type} ${quest.difficulty}`,
    hp: quest.enemyHealth,
    attack: quest.enemyDamage,
    defenseCap,
    aoeDamage: quest.aoeDamage,
    aoeChance: quest.aoeChance,
    lcog: quest.lcog,
    isBoss: quest.isBoss,
    isExtreme: quest.isExtreme,
    barrierType: quest.barrierType,
    barrierHealth: quest.barrierHealth
  };
}

export function estimateQuestDefenseCap(quest: QuestData): number {
  return quest.defenseCap > 0 ? quest.defenseCap : Math.max(0, Math.round(quest.enemyDamage * 300));
}

export function calculateBarrierCoverage(quest: CombatQuestInput, combatants: CombatantInput[]): BarrierCoverage {
  const types = quest.barrierType
    .split(',')
    .map((entry) => normalizeElementKey(entry))
    .filter(Boolean);
  const required = Math.max(0, quest.barrierHealth);

  if (types.length === 0 || required === 0) {
    return { types, required, available: 0, met: true };
  }

  const available = combatants.reduce((total, combatant) => {
    const scores = combatant.elementScores ?? {};
    return total + types.reduce((innerTotal, type) => innerTotal + (scores[type] ?? 0), 0);
  }, 0);

  return {
    types,
    required,
    available,
    met: available >= required
  };
}

export function roundExcel(value: number): number {
  return Math.round(value);
}

export function roundupExcel(value: number): number {
  return value < 0 ? -Math.ceil(Math.abs(value)) : Math.ceil(value);
}

export function rounddownExcel(value: number): number {
  return value < 0 ? -Math.floor(Math.abs(value)) : Math.floor(value);
}

function safeRoundup(value: number): number {
  if (!Number.isFinite(value)) {
    return value > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return Math.max(0, roundupExcel(value));
}

function linear(value: number, fromValue: number, toValue: number, fromResult: number, toResult: number): number {
  if (toValue === fromValue) {
    return toResult;
  }
  return fromResult + ((value - fromValue) / (toValue - fromValue)) * (toResult - fromResult);
}

function normalizeElementKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === 'luxurious' ? 'gold' : normalized;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}
