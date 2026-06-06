import type { ElementScores, HeroRole, PercentModifiers, QuestData, StatBlock } from './types';

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
  miniBoss?: RessMiniBossModifier;
}

export type RessMiniBossModifier = 'None' | 'Agile' | 'Dire' | 'Huge' | 'Legendary';

export interface CombatantInput {
  id: string;
  name: string;
  kind: 'hero' | 'champion';
  stats: StatBlock;
  elementScores?: ElementScores;
  className?: string;
  role?: HeroRole;
  tier?: number;
  modifiers?: Partial<Pick<PercentModifiers, 'attack' | 'defense' | 'hp'>>;
  combatEffects?: Partial<CombatSpiritEffects> & {
    artifact?: string;
    aurasongName?: string;
  };
}

export interface CombatSpiritEffects {
  armadillo: number;
  lizard: number;
  shark: number;
  dinosaur: number;
  mundra: number;
}

export interface EnemyDamageInput {
  heroDefense: number;
  questAttack: number;
  questDefenseCap: number;
}

export interface EnemyCriticalDamageInput {
  damagePerHit: number;
  questAttack: number;
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

export interface RessSimulationOptions {
  runs?: number;
  seed?: number;
}

export interface RessSimulationRow {
  combatant: CombatantInput;
  stats: StatBlock;
  targetPercent: number;
  damagePerHit: number;
  criticalDamagePerHit: number;
  survivalRate: number;
  averageHpRemaining: number;
  maximumHpRemaining: number;
  averageDamageDealt: number;
  maximumDamageDealt: number;
  minimumDamageDealt: number;
  survives: boolean;
}

export interface RessEnemyState {
  hp: number;
  attack: number;
  aoeChance: number;
  critChance: number;
  evasion: number;
  miniBoss: RessMiniBossModifier;
}

export interface RessQuestSimulation {
  quest: CombatQuestInput;
  enemy: RessEnemyState;
  rows: RessSimulationRow[];
  simulations: number;
  successRate: number;
  minimumRounds: number;
  averageRounds: number;
  maximumRounds: number;
  roundLimitHit: boolean;
  roundLimitRate: number;
  poloniaLootAverage: number;
  poloniaLootCapRate: number;
  survivingCombatants: number;
  occupiedCombatants: number;
  barrier: BarrierCoverage;
  warnings: string[];
}

interface PreparedRessUnit {
  combatant: CombatantInput;
  className: string;
  role: HeroRole;
  tier: number;
  artifact: string;
  maxHp: number;
  attackBase: number;
  attackModifier: number;
  defense: number;
  critChance: number;
  critMult: number;
  evasion: number;
  evasionCap: number;
  threat: number;
  elementScores: ElementScores;
  armadillo: number;
  lizard: number;
  shark: number;
  dinosaur: number;
  mundra: number;
}

interface RuntimeRessUnit extends PreparedRessUnit {
  hp: number;
  damageFight: number;
  surviveChance: number;
  guaranteedCrit: boolean;
  guaranteedEvade: boolean;
  lostInnateRound: number;
  consecutiveCritBonus: number;
  berserkerStage: number;
  berserkerLevel: number;
  jarlHp1: number;
  jarlHp2: number;
  jarlHp3: number;
  ninjaBonus: number;
  ninjaEvasion: number;
  hemmaBonus: number;
  critChanceModifier: number;
  championModifier: number;
  noEvasion: boolean;
}

interface ChampionAuraState {
  championName: string;
  tier: number;
  aurasongName: string;
  rudoBarrierBonus: number;
  hemmaIndex: number;
  hemmaMultiplier: number;
  countPoloniaLoot: boolean;
  poloniaLootChance: number;
  poloniaLootCap: number;
  warnings: string[];
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

export function calculateEnemyCriticalDamageTaken({ damagePerHit, questAttack }: EnemyCriticalDamageInput): number {
  return Math.max(damagePerHit * 1.5, roundupExcel(1.5 * questAttack));
}

export function calculateRessEnemyCriticalDamage(damagePerHit: number, questAttack: number): number {
  return roundExcel(Math.max(damagePerHit, questAttack) * 1.5);
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

export function calculateRessQuestSimulation(
  quest: CombatQuestInput,
  combatants: CombatantInput[],
  options: RessSimulationOptions = {}
): RessQuestSimulation {
  const simulations = clampInteger(options.runs ?? 10000, 1, 50000);
  const random = createSeededRandom(options.seed ?? 9348677);
  const enemy = calculateRessEnemyState(quest);
  const warnings: string[] = [
    'Monte Carlo uses Ress Apps Script formulas ported from myFunction_V2; results are deterministic in the app because a fixed seed is used.'
  ];
  const prepared = prepareRessUnits(quest, combatants, warnings);
  const occupiedCombatants = prepared.length;

  if (occupiedCombatants === 0) {
    return {
      quest,
      enemy,
      rows: [],
      simulations,
      successRate: 0,
      minimumRounds: 0,
      averageRounds: 0,
      maximumRounds: 0,
      roundLimitHit: false,
      roundLimitRate: 0,
      poloniaLootAverage: 0,
      poloniaLootCapRate: 0,
      survivingCombatants: 0,
      occupiedCombatants: 0,
      barrier: calculateBarrierCoverage(quest, []),
      warnings: ['No roster combatants are available for simulation.', ...warnings]
    };
  }

  const championState = applyRessChampionAndAurasongBonuses(quest, prepared, warnings);
  const barrier = calculateRessBarrierCoverage(quest, prepared, championState.rudoBarrierBonus);
  const barrierModifier = barrier.required > 0 && !barrier.met ? 0.2 : 1;
  const enemyDamage = enemy.attack;
  const enemyCritChance = enemy.critChance / 100;
  const enemyEvasion = enemy.evasion / 100;
  const aoeChance = Math.max(0, enemy.aoeChance) / 100;
  const aoeDamageRatio = quest.attack > 0 ? Math.max(0, quest.aoeDamage) / quest.attack : 0;
  const damageTaken = prepared.map((unit) =>
    calculateEnemyDamagePerHit({
      heroDefense: unit.defense,
      questAttack: enemyDamage,
      questDefenseCap: quest.defenseCap
    })
  );
  const criticalDamageTaken = damageTaken.map((damage) => calculateRessEnemyCriticalDamage(damage, enemyDamage));

  const survivalCounts = prepared.map(() => 0);
  const hpRemainingAvg = prepared.map(() => 0);
  const hpRemainingMax = prepared.map(() => 0);
  const damageDealtAvg = prepared.map(() => 0);
  const damageDealtMax = prepared.map(() => 0);
  const damageDealtMin = prepared.map(() => Number.POSITIVE_INFINITY);
  let questWins = 0;
  let roundsTotal = 0;
  let roundsMax = 0;
  let roundsMin = Number.POSITIVE_INFINITY;
  let roundLimitHit = false;
  let roundLimitTimes = 0;
  let poloniaLootTotal = 0;
  let poloniaLootCapHits = 0;

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const units = prepared.map((unit) => createRuntimeUnit(unit));
    let mobHp = enemy.hp;
    let heroesAlive = units.filter((unit) => unit.maxHp > 0).length;
    let continueFight = true;
    let updateTarget = true;
    let round = 0;
    let sharkActive = false;
    let dinosaurActive = true;
    let lordSave = true;
    let poloniaLoot = 0;
    let rudoBonus = initialRudoBonus(championState.championName, championState.tier);
    let targetThresholds = buildTargetThresholds(units);
    const attackOrder = shuffleIndices(units.length, random);
    const lordIndex = units.findIndex((unit) => unit.className === 'Lord' && unit.maxHp > 0);
    const lordPresent = lordIndex >= 0;

    for (const unit of units) {
      unit.hp = unit.artifact === 'Backfire Hammer' ? 0.75 * unit.maxHp : unit.maxHp;
      unit.damageFight = 0;
      unit.surviveChance = unit.armadillo / 100;
      if (unit.className === 'Cleric' || unit.className === 'Bishop') {
        unit.surviveChance = 1.2;
      }
      unit.berserkerStage = 0;
      unit.guaranteedCrit = false;
      unit.guaranteedEvade = unit.className === 'Daimyo';
      unit.lostInnateRound = -5;
      unit.consecutiveCritBonus = 0;
      unit.hemmaBonus = 0;
      applyStartingInnateState(unit);
    }

    while (continueFight) {
      round += 1;

      if (updateTarget) {
        targetThresholds = buildTargetThresholds(units);
        updateTarget = false;
      }

      for (const unit of units) {
        if (unit.className === 'Sensei' && unit.lostInnateRound === round - 2) {
          applyNinjaState(unit);
        }
      }

      const extremeCritBonus = units.map((unit) => {
        const effectiveEvasion = unit.evasion + unit.berserkerStage * 0.1 + unit.ninjaEvasion;
        return quest.isExtreme && effectiveEvasion < 0 && !unit.noEvasion ? -0.25 * effectiveEvasion : 0;
      });

      if (random() < aoeChance && heroesAlive > 1) {
        for (let index = 0; index < units.length; index += 1) {
          const unit = units[index];
          if (unit.hp <= 0) {
            continue;
          }
          if (unitEvades(unit, random)) {
            if (unit.className === 'Dancer/Acrobat') {
              unit.guaranteedCrit = true;
            }
            continue;
          }

          const damage = Math.ceil(damageTaken[index] * aoeDamageRatio);
          unit.hp -= damage;
          if (unit.hp <= 0) {
            const result = resolveFatalBlow({
              units,
              targetIndex: index,
              incomingDamage: damage,
              lordIncomingDamage: lordIndex >= 0 ? Math.ceil(damageTaken[lordIndex] * aoeDamageRatio) : damage,
              lordIndex,
              lordPresent,
              lordSave,
              random
            });
            lordSave = result.lordSave;
            heroesAlive -= result.deaths;
            updateTarget = updateTarget || result.deaths > 0;
          }
          if (unit.className === 'Sensei' && unit.lostInnateRound !== round - 1) {
            unit.lostInnateRound = round;
          }
        }
      } else {
        const target = chooseTarget(units, targetThresholds, random);
        const unit = units[target];

        if (unitEvades(unit, random)) {
          if (unit.className === 'Dancer/Acrobat') {
            unit.guaranteedCrit = true;
          }
        } else {
          const critChance = enemyCritChance + extremeCritBonus[target];
          const incomingDamage = random() > critChance ? damageTaken[target] : criticalDamageTaken[target];
          unit.hp -= incomingDamage;
          if (unit.hp <= 0) {
            const result = resolveFatalBlow({
              units,
              targetIndex: target,
              incomingDamage,
              lordIncomingDamage: lordIndex >= 0 ? damageTaken[lordIndex] : incomingDamage,
              lordIndex,
              lordPresent,
              lordSave,
              random
            });
            lordSave = result.lordSave;
            heroesAlive -= result.deaths;
            updateTarget = updateTarget || result.deaths > 0;
          }
          if (unit.className === 'Sensei' && unit.lostInnateRound !== round - 1) {
            unit.lostInnateRound = round;
          }
        }
      }

      applyHemmaDrain(units, championState, round);
      for (const unit of units) {
        updateBerserkerStage(unit);
        if (unit.className === 'Ninja' && unit.hp < unit.maxHp) {
          unit.ninjaBonus = 0;
          unit.ninjaEvasion = 0;
        }
        if (unit.className === 'Sensei' && unit.lostInnateRound === round) {
          unit.ninjaBonus = 0;
          unit.ninjaEvasion = 0;
        }
        if (round === 1 && (unit.className === 'Samurai' || unit.className === 'Daimyo')) {
          unit.guaranteedCrit = true;
          unit.guaranteedEvade = false;
        }
      }

      for (const unitIndex of attackOrder) {
        const unit = units[unitIndex];
        if (unit.hp > 0 && random() > enemyEvasion) {
          const critChance =
            (unit.critChance + unit.ninjaBonus + rudoBonus) * unit.critChanceModifier +
            (1 - unit.critChanceModifier) * 0.2;
          const crit = random() < critChance || unit.guaranteedCrit;
          const attackMultiplier =
            unit.attackModifier +
            0.2 * unit.mundra +
            (sharkActive ? 0.01 * unit.shark : 0) +
            (dinosaurActive ? 0.01 * unit.dinosaur : 0) +
            0.1 * (1 + unit.berserkerLevel) * unit.berserkerStage;
          const baseDamage = unit.attackBase * attackMultiplier + unit.hemmaBonus;
          const ignoresBarrier = round === 1 && (unit.className === 'Samurai' || unit.className === 'Daimyo');
          const outgoingDamage =
            baseDamage * (crit ? unit.critMult + unit.consecutiveCritBonus : 1) * (ignoresBarrier ? 1 : barrierModifier);

          mobHp -= outgoingDamage;
          unit.damageFight += outgoingDamage;

          if (unit.className === 'Conquistador') {
            unit.consecutiveCritBonus = crit ? Math.min(unit.consecutiveCritBonus + 0.25, 1) : 0;
          }

          if (championState.countPoloniaLoot && random() < championState.poloniaLootChance) {
            poloniaLoot += 1;
          }
        }

        if (unit.className === 'Dark Knight' || unit.className === 'Death Knight') {
          if (mobHp < enemy.hp * 0.1) {
            mobHp = -13;
          }
        }

        if (mobHp < enemy.hp / 2) {
          sharkActive = true;
        }

        unit.guaranteedCrit = false;
      }

      dinosaurActive = false;

      if (mobHp <= 0) {
        continueFight = false;
        questWins += 1;
        for (let index = 0; index < units.length; index += 1) {
          const unit = units[index];
          if (unit.hp > 0) {
            survivalCounts[index] += 1;
            hpRemainingMax[index] = Math.max(hpRemainingMax[index], unit.hp);
          }
          hpRemainingAvg[index] += Math.max(unit.hp, 0);
        }
        roundsTotal += round;
        roundsMax = Math.max(roundsMax, round);
        roundsMin = Math.min(roundsMin, round);
      }

      if (heroesAlive === 0) {
        continueFight = false;
      }

      if (continueFight && round === 499) {
        continueFight = false;
        roundLimitHit = true;
        roundLimitTimes += 1;
      }

      if (!continueFight) {
        poloniaLootTotal += Math.min(poloniaLoot, championState.poloniaLootCap);
        if (poloniaLoot >= championState.poloniaLootCap) {
          poloniaLootCapHits += 1;
        }
        for (let index = 0; index < units.length; index += 1) {
          const damage = units[index].damageFight;
          damageDealtAvg[index] += damage;
          damageDealtMax[index] = Math.max(damageDealtMax[index], damage);
          damageDealtMin[index] = Math.min(damageDealtMin[index], damage);
        }
      }

      rudoBonus = expireRudoBonus(rudoBonus, championState.tier, round);

      if (continueFight) {
        for (const unit of units) {
          if (unit.hp > 0) {
            unit.hp = Math.min(unit.hp + unit.lizard, unit.maxHp);
            if (unit.className === 'Cleric') {
              unit.hp = Math.min(unit.hp + Math.min(unit.tier, 3) * 5 - 5, unit.maxHp);
            } else if (unit.className === 'Bishop') {
              if (unit.tier === 2) {
                unit.hp = Math.min(unit.hp + 5, unit.maxHp);
              }
              if (unit.tier >= 3) {
                unit.hp = Math.min(unit.hp + 20, unit.maxHp);
              }
            }
            unit.hp = Math.min(unit.hp + liluHeal(championState.championName, championState.tier, unit.championModifier), unit.maxHp);
          }
        }
        for (const unit of units) {
          updateBerserkerStage(unit);
        }
      }
    }
  }

  let successRate = (questWins * 100) / simulations;
  if (prepared.some((unit) => unit.className === 'Fateweaver' || unit.className === 'Chronomancer')) {
    successRate = (1 - Math.pow(1 - successRate / 100, 2)) * 100;
  }

  const rows = prepared.map((unit, index) => {
    const survivalRate = (survivalCounts[index] * 100) / simulations;
    return {
      combatant: unit.combatant,
      stats: {
        attack: roundExcel(unit.attackBase * unit.attackModifier),
        defense: roundExcel(unit.defense),
        hp: roundExcel(unit.maxHp),
        evasion: roundPercent(unit.evasion * 100),
        critChance: roundPercent(unit.critChance * 100),
        critDamage: roundPercent(unit.critMult),
        threat: unit.threat,
        power: unit.combatant.stats.power
      },
      targetPercent: averageTargetPercent(unit, prepared),
      damagePerHit: damageTaken[index],
      criticalDamagePerHit: criticalDamageTaken[index],
      survivalRate,
      averageHpRemaining: hpRemainingAvg[index] / simulations,
      maximumHpRemaining: hpRemainingMax[index],
      averageDamageDealt: damageDealtAvg[index] / simulations,
      maximumDamageDealt: damageDealtMax[index],
      minimumDamageDealt: Number.isFinite(damageDealtMin[index]) ? damageDealtMin[index] : 0,
      survives: survivalRate >= 99.5
    };
  });

  return {
    quest,
    enemy,
    rows,
    simulations,
    successRate,
    minimumRounds: Number.isFinite(roundsMin) ? roundsMin : 0,
    averageRounds: questWins > 0 ? roundsTotal / questWins : 0,
    maximumRounds: roundsMax,
    roundLimitHit,
    roundLimitRate: (roundLimitTimes * 100) / simulations,
    poloniaLootAverage: poloniaLootTotal / simulations,
    poloniaLootCapRate: (poloniaLootCapHits * 100) / simulations,
    survivingCombatants: rows.filter((row) => row.survivalRate > 0).length,
    occupiedCombatants,
    barrier,
    warnings: [...warnings, ...championState.warnings]
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
  const criticalDamageTaken = calculateEnemyCriticalDamageTaken({
    damagePerHit: damageTaken,
    questAttack: input.mobBaseDamage
  });
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

export function questToCombatInput(
  quest: QuestData,
  defenseCap = estimateQuestDefenseCap(quest),
  miniBoss: RessMiniBossModifier = 'None'
): CombatQuestInput {
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
    barrierHealth: quest.barrierHealth,
    miniBoss
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

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateRessEnemyState(quest: CombatQuestInput): RessEnemyState {
  const miniBoss = quest.miniBoss ?? 'None';
  let hpModifier = 1;
  let attackModifier = 1;
  let critChanceModifier = 1;
  let aoeChanceModifier = 1;
  let evasion = -100;

  if (miniBoss === 'Agile') {
    evasion = 40;
  } else if (miniBoss === 'Dire') {
    hpModifier = 1.5;
    critChanceModifier = 3;
  } else if (miniBoss === 'Huge') {
    hpModifier = 2;
    aoeChanceModifier = 3;
  } else if (miniBoss === 'Legendary') {
    hpModifier = 1.5;
    attackModifier = 1.25;
    critChanceModifier = 1.5;
    evasion = 10;
  }

  return {
    hp: roundExcel(Math.max(0, quest.hp) * hpModifier),
    attack: roundExcel(Math.max(0, quest.attack) * attackModifier),
    aoeChance: Math.max(0, quest.aoeChance) * aoeChanceModifier,
    critChance: 10 * critChanceModifier,
    evasion,
    miniBoss
  };
}

function prepareRessUnits(quest: CombatQuestInput, combatants: CombatantInput[], warnings: string[]): PreparedRessUnit[] {
  return combatants
    .filter((entry) => entry.stats.hp > 0 || entry.stats.attack > 0 || entry.stats.defense > 0)
    .map((combatant) => {
      const className = normalizeRessClassName(combatant.className ?? combatant.name);
      const attackModifier = 1 + (combatant.modifiers?.attack ?? 0);
      const defenseModifier = 1 + (combatant.modifiers?.defense ?? 0);
      const effects = combatant.combatEffects ?? {};
      const artifact = effects.artifact ?? 'None';
      const mundra = quest.isBoss ? effects.mundra ?? 0 : 0;
      const attackBase = attackModifier > 0 ? combatant.stats.attack / attackModifier : combatant.stats.attack;
      const defenseBase = defenseModifier > 0 ? combatant.stats.defense / defenseModifier : combatant.stats.defense;
      const evasion = ((quest.isExtreme ? combatant.stats.evasion - 20 : combatant.stats.evasion) || 0) / 100;

      if (artifact === 'Kiku-Ichimonji') {
        warnings.push(`${combatant.name}: Kiku-Ichimonji uses Ress' fixed 20% critical branch.`);
      }

      return {
        combatant,
        className,
        role: combatant.role ?? 'unknown',
        tier: clampInteger(combatant.tier ?? 0, 0, 4),
        artifact,
        maxHp: combatant.stats.hp,
        attackBase: artifact === 'Pickaxe of Greed' && quest.lcog ? attackBase * 2 : attackBase,
        attackModifier,
        defense: defenseBase * (defenseModifier + 0.2 * mundra),
        critChance: combatant.stats.critChance / 100,
        critMult: combatant.stats.critDamage,
        evasion,
        evasionCap: className === 'Pathfinder' ? 0.78 : 0.75,
        threat: Math.max(0, combatant.stats.threat),
        elementScores: combatant.elementScores ?? {},
        armadillo: effects.armadillo ?? 0,
        lizard: effects.lizard ?? 0,
        shark: effects.shark ?? 0,
        dinosaur: effects.dinosaur ?? 0,
        mundra
      };
    });
}

function createRuntimeUnit(unit: PreparedRessUnit): RuntimeRessUnit {
  return {
    ...unit,
    hp: unit.maxHp,
    damageFight: 0,
    surviveChance: 0,
    guaranteedCrit: false,
    guaranteedEvade: false,
    lostInnateRound: -5,
    consecutiveCritBonus: 0,
    berserkerStage: 0,
    berserkerLevel: unit.className === 'Berserker/Jarl' ? Math.min(unit.tier, 4) : 0,
    jarlHp1: unit.tier === 4 ? 0.8 : 0.75,
    jarlHp2: unit.tier === 4 ? 0.55 : 0.5,
    jarlHp3: unit.tier === 4 ? 0.3 : 0.25,
    ninjaBonus: 0,
    ninjaEvasion: 0,
    hemmaBonus: 0,
    critChanceModifier: unit.artifact === 'Kiku-Ichimonji' ? 0 : 1,
    championModifier: unit.artifact === 'Lone Wolf Cowl' ? 0 : 1,
    noEvasion: unit.artifact === 'Rock Stompers'
  };
}

function applyRessChampionAndAurasongBonuses(
  quest: CombatQuestInput,
  units: PreparedRessUnit[],
  warnings: string[]
): ChampionAuraState {
  const champion = units.find((unit) => unit.combatant.kind === 'champion');
  const championName = champion?.className ?? 'None';
  const tier = champion?.tier ?? 0;
  const aurasongName = champion?.combatant.combatEffects?.aurasongName ?? '';
  const numFighters = units.filter((unit) => isRessFighter(unit)).length;
  const numRogues = units.filter((unit) => isRessRogue(unit)).length;
  const numSpellcasters = units.filter((unit) => isRessSpellcaster(unit)).length;
  const state: ChampionAuraState = {
    championName,
    tier,
    aurasongName,
    rudoBarrierBonus: championName === 'Rudo' && tier > 2 ? 1.5 : 1,
    hemmaIndex: units.findIndex((unit) => unit.className === 'Hemma'),
    hemmaMultiplier: championName === 'Hemma' ? 0.15 + tier * 0.05 : 0,
    countPoloniaLoot: false,
    poloniaLootChance: 0,
    poloniaLootCap: 20,
    warnings: []
  };
  const bjornMultiplier = isBjornDoubleQuest(quest.name) ? 2 : 1;
  let championAttackBonus = 0;
  let championDefenseBonus = 0;
  let championHpBonus = 0;

  if (championName === 'Argon') {
    championAttackBonus = 0.1 * tier;
    championDefenseBonus = 0.1 * tier;
  } else if (championName === 'Ashley') {
    championAttackBonus = 0.05 + 0.05 * tier;
    championDefenseBonus = 0.05 + 0.05 * tier;
    if (quest.isBoss) {
      championAttackBonus *= 2;
      championDefenseBonus *= 2;
    }
  } else if (championName === 'Bjorn') {
    for (const unit of units) {
      unit.critMult += (0.1 + 0.1 * tier) * bjornMultiplier * championFactor(unit);
    }
    championHpBonus = 0.05 * tier * bjornMultiplier;
    championAttackBonus = (tier < 3 ? 0.05 + 0.05 * tier : 0.1 * tier - 0.1) * bjornMultiplier;
  } else if (championName === 'Donovan') {
    championAttackBonus = ([0, 0.05, 0.08, 0.1, 0.14][tier] ?? 0) * numSpellcasters;
    championHpBonus = (0.04 + 0.01 * tier + 0.02 * Math.max(tier - 3, 0)) * numFighters;
    const rogueBonus = (0.02 + 0.01 * tier + 0.01 * Math.max(tier - 3, 0)) * numRogues;
    for (const unit of units) {
      unit.critChance += rogueBonus * championFactor(unit);
      unit.evasion += rogueBonus * championFactor(unit);
    }
  } else if (championName === 'Hemma') {
    championHpBonus = 0.05 * tier + 0.05 * Math.max(tier - 3, 0);
  } else if (championName === 'Lilu') {
    championHpBonus = 0.05 + 0.05 * tier;
  } else if (championName === 'Malady') {
    championAttackBonus = [0, 0.1, 0.15, 0.2, 0.3][tier] ?? 0;
    const evasionBonus = [0, 0.05, 0.1, 0.1, 0.15][tier] ?? 0;
    const critBonus = [0, 0.03, 0.05, 0.08, 0.1][tier] ?? 0;
    for (const unit of units) {
      unit.evasion += evasionBonus * championFactor(unit);
      unit.critChance += critBonus * championFactor(unit);
    }
    state.warnings.push('Malady aura is applied party-wide; Ress Apps Script appears to miss a local loop in that block.');
  } else if (championName === 'Polonia') {
    championDefenseBonus = 0.05 + 0.05 * tier;
    for (const unit of units) {
      unit.evasion += (tier < 3 ? 0.05 : 0.1) * championFactor(unit);
    }
    state.countPoloniaLoot = true;
    state.poloniaLootChance = ([0, 0.3, 0.35, 0.4, 0.5][tier] ?? 0) + units.filter((unit) => unit.className === 'Trickster').length * 0.02;
    state.poloniaLootCap += units.filter((unit) => unit.className === 'Trickster').length * 2;
  } else if (championName === 'Reinhold') {
    championAttackBonus = 0.05 + 0.05 * tier + 0.05 * Math.max(tier - 3, 0);
    championDefenseBonus = championAttackBonus;
    championHpBonus = championAttackBonus;
  } else if (championName === 'Sia') {
    championAttackBonus = 0.05 + 0.05 * tier;
  } else if (championName === 'Yami') {
    for (const unit of units) {
      unit.critChance += 0.05 * tier * championFactor(unit);
      unit.evasion += 0.05 * tier * championFactor(unit);
    }
  } else if (championName === 'Tamas') {
    state.warnings.push('Tamas random leather attack bonus is not implemented in the MVP simulator.');
  }

  const aurasong = aurasongBonuses(aurasongName);
  if (aurasong.unsupported) {
    state.warnings.push(`${aurasongName} is not mapped in Ress V9.4 Apps Script and is ignored as a party aura.`);
  }
  for (const unit of units) {
    if (aurasong.lizard > 0) {
      unit.lizard += aurasong.lizard;
    }
    unit.maxHp = (unit.maxHp + aurasong.flatHp) * (1 + championHpBonus * championFactor(unit) + aurasong.hp);
    unit.attackBase *= 1 + championAttackBonus * championFactor(unit) + aurasong.attack;
    unit.defense *= 1 + championDefenseBonus * championFactor(unit) + aurasong.defense;
    unit.critMult += aurasong.critDamage;
    unit.evasion += aurasong.evasion;
    unit.critChance += aurasong.critChance;
  }

  warnings.push(`${championName === 'None' ? 'No champion' : `${championName} tier ${tier}`} and ${aurasongName || 'no Aurasong'} applied through Ress simulator rules.`);
  return state;
}

function aurasongBonuses(name: string): {
  attack: number;
  defense: number;
  hp: number;
  flatHp: number;
  evasion: number;
  critChance: number;
  critDamage: number;
  lizard: number;
  unsupported: boolean;
} {
  const normalized = name.toLowerCase();
  const bonuses = { attack: 0, defense: 0, hp: 0, flatHp: 0, evasion: 0, critChance: 0, critDamage: 0, lizard: 0, unsupported: false };
  if (!normalized) {
    return bonuses;
  }
  if (normalized.includes('gleaming aura')) {
    bonuses.lizard = 1;
  } else if (normalized.includes('aura of rains')) {
    bonuses.flatHp = 10;
  } else if (normalized.includes('aura of quakes')) {
    bonuses.defense = 0.1;
  } else if (normalized.includes('aura of growth')) {
    bonuses.hp = 0.05;
  } else if (normalized.includes('aura of flames')) {
    bonuses.attack = 0.1;
  } else if (normalized.includes('aura of malice')) {
    bonuses.critDamage = 0.2;
  } else if (normalized.includes('aura of sparks')) {
    bonuses.attack = 0.15;
  } else if (normalized.includes('aura of winds')) {
    bonuses.evasion = 0.02;
  } else if (normalized.includes('aura of love')) {
    bonuses.hp = 0.1;
  } else if (normalized.includes('aura of power')) {
    bonuses.attack = 0.1;
    bonuses.defense = 0.1;
  } else if (normalized.includes('prismatic aura')) {
    bonuses.evasion = 0.02;
    bonuses.critChance = 0.02;
  } else if (normalized.includes('aura of storms')) {
    bonuses.attack = 0.15;
    bonuses.defense = 0.15;
  } else if (normalized.includes('aura of victory')) {
    bonuses.attack = 0.1;
    bonuses.hp = 0.1;
  } else if (normalized.includes('aura of transmutation')) {
    bonuses.defense = 0.18;
    bonuses.hp = 0.12;
  } else if (normalized.includes('aura of inspiration')) {
    bonuses.attack = 0.12;
    bonuses.defense = 0.12;
    bonuses.hp = 0.08;
  } else {
    bonuses.unsupported = true;
  }
  return bonuses;
}

function applyStartingInnateState(unit: RuntimeRessUnit): void {
  if (unit.className === 'Ninja' || unit.className === 'Sensei') {
    applyNinjaState(unit);
  }
  if (unit.className === 'Daimyo') {
    unit.guaranteedEvade = true;
  }
}

function applyNinjaState(unit: RuntimeRessUnit): void {
  unit.ninjaBonus = 0.1 + Math.min(unit.tier, 4) * 0.1;
  unit.ninjaEvasion = 0.15;
  if (unit.tier === 3) {
    unit.ninjaEvasion = 0.2;
  }
  if (unit.tier === 4) {
    unit.ninjaEvasion = 0.25;
  }
}

function updateBerserkerStage(unit: RuntimeRessUnit): void {
  if (unit.className !== 'Berserker/Jarl') {
    return;
  }
  if (unit.hp >= unit.jarlHp1 * unit.maxHp) {
    unit.berserkerStage = 0;
  } else if (unit.hp >= unit.jarlHp2 * unit.maxHp) {
    unit.berserkerStage = 1;
  } else if (unit.hp >= unit.jarlHp3 * unit.maxHp) {
    unit.berserkerStage = 2;
  } else if (unit.hp > 0) {
    unit.berserkerStage = 3;
  }
}

function unitEvades(unit: RuntimeRessUnit, random: () => number): boolean {
  return (
    unit.guaranteedEvade ||
    (random() < Math.min(unit.evasion + unit.berserkerStage * 0.1 + unit.ninjaEvasion, unit.evasionCap) && !unit.noEvasion)
  );
}

function resolveFatalBlow({
  units,
  targetIndex,
  incomingDamage,
  lordIncomingDamage,
  lordIndex,
  lordPresent,
  lordSave,
  random
}: {
  units: RuntimeRessUnit[];
  targetIndex: number;
  incomingDamage: number;
  lordIncomingDamage: number;
  lordIndex: number;
  lordPresent: boolean;
  lordSave: boolean;
  random: () => number;
}): { deaths: number; lordSave: boolean } {
  const target = units[targetIndex];
  if (random() < target.surviveChance) {
    target.hp = 1;
    target.surviveChance = 0;
    return { deaths: 0, lordSave };
  }
  if (lordPresent && lordSave && target.className !== 'Lord' && units[lordIndex]?.hp > 0) {
    target.hp += incomingDamage;
    const lord = units[lordIndex];
    lord.hp -= lordIncomingDamage;
    lordSave = false;
    if (lord.hp <= 0) {
      if (random() < lord.surviveChance) {
        lord.hp = 1;
        lord.surviveChance = 0;
        return { deaths: 0, lordSave };
      }
      lord.hp = 0;
      return { deaths: 1, lordSave };
    }
    return { deaths: 0, lordSave };
  }
  target.hp = 0;
  return { deaths: 1, lordSave };
}

function applyHemmaDrain(units: RuntimeRessUnit[], championState: ChampionAuraState, round: number): void {
  const hemma = units[championState.hemmaIndex];
  if (championState.championName !== 'Hemma' || !hemma || hemma.hp <= 0) {
    return;
  }
  const drainPercent = 0.11 - 0.01 * championState.tier;
  let drainIndex = -1;
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    if (index !== championState.hemmaIndex && unit.hp > drainPercent * unit.maxHp) {
      if (drainIndex === -1 || unit.hp / unit.maxHp > units[drainIndex].hp / units[drainIndex].maxHp) {
        drainIndex = index;
      }
    }
  }
  if (drainIndex === -1) {
    return;
  }
  const drained = units[drainIndex];
  drained.hp -= drainPercent * drained.maxHp;
  if (drained.className === 'Sensei' && drained.lostInnateRound !== round - 1) {
    drained.lostInnateRound = round;
  }
  hemma.hemmaBonus += hemma.attackBase * championState.hemmaMultiplier;
  hemma.hp = Math.min(hemma.hp + Math.max(0, championState.tier + Math.min(championState.tier - 3, 0)) * 5, hemma.maxHp);
}

function buildTargetThresholds(units: RuntimeRessUnit[]): number[] {
  const aliveThreat = units.reduce((total, unit) => total + (unit.hp > 0 ? unit.threat : 0), 0);
  let cumulative = 0;
  return units.map((unit) => {
    cumulative += unit.hp > 0 && aliveThreat > 0 ? unit.threat / aliveThreat : 0;
    return cumulative;
  });
}

function chooseTarget(units: RuntimeRessUnit[], thresholds: number[], random: () => number): number {
  const roll = random();
  for (let index = 0; index < thresholds.length; index += 1) {
    if (units[index].hp > 0 && roll <= thresholds[index]) {
      return index;
    }
  }
  return Math.max(0, units.findIndex((unit) => unit.hp > 0));
}

function shuffleIndices(length: number, random: () => number): number[] {
  const values = Array.from({ length }, (_, index) => index);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function initialRudoBonus(championName: string, tier: number): number {
  if (championName !== 'Rudo') {
    return 0;
  }
  if (tier === 1) {
    return 0.3;
  }
  if (tier === 2 || tier === 3) {
    return 0.4;
  }
  if (tier === 4) {
    return 0.5;
  }
  return 0;
}

function expireRudoBonus(current: number, tier: number, round: number): number {
  if ((tier === 1 && round === 2) || (tier === 2 && round === 3) || (tier === 3 && round === 3) || (tier === 4 && round === 4)) {
    return 0;
  }
  return current;
}

function liluHeal(championName: string, tier: number, championModifier: number): number {
  if (championName !== 'Lilu') {
    return 0;
  }
  return ([0, 3, 5, 10, 20][tier] ?? 0) * championModifier;
}

function averageTargetPercent(unit: PreparedRessUnit, units: PreparedRessUnit[]): number {
  const totalThreat = units.reduce((total, entry) => total + Math.max(0, entry.threat), 0);
  return totalThreat > 0 ? (Math.max(0, unit.threat) / totalThreat) * 100 : 0;
}

function calculateRessBarrierCoverage(
  quest: CombatQuestInput,
  units: PreparedRessUnit[],
  rudoBarrierBonus: number
): BarrierCoverage {
  const types = quest.barrierType
    .split(',')
    .map((entry) => normalizeElementKey(entry))
    .filter(Boolean);
  const required = Math.max(0, quest.barrierHealth);
  if (types.length === 0 || required === 0) {
    return { types, required, available: 0, met: true };
  }

  const available = units.reduce((total, unit) => {
    const direct = types.reduce((inner, type) => inner + (unit.elementScores[type] ?? 0), 0);
    const any = unit.elementScores.any ?? unit.elementScores.all ?? 0;
    return total + (direct + any * 0.5) * rudoBarrierBonus;
  }, 0);
  return {
    types,
    required,
    available,
    met: available >= required
  };
}

function championFactor(unit: PreparedRessUnit): number {
  return (unit.className === 'Mercenary' ? 1.25 : 1) * (unit.artifact === 'Lone Wolf Cowl' ? 0 : 1);
}

function isRessFighter(unit: PreparedRessUnit): boolean {
  return (
    unit.role === 'fighter' ||
    ['Mercenary', 'Lord', 'Samurai', 'Daimyo', 'Berserker/Jarl', 'Dark Knight', 'Death Knight', 'Red/Fighter Type'].includes(
      unit.className
    )
  );
}

function isRessRogue(unit: PreparedRessUnit): boolean {
  return (
    unit.role === 'rogue' ||
    ['Trickster', 'Conquistador', 'Pathfinder', 'Ninja', 'Sensei', 'Dancer/Acrobat', 'Green/Rogue Type'].includes(unit.className)
  );
}

function isRessSpellcaster(unit: PreparedRessUnit): boolean {
  return (
    unit.role === 'spellcaster' ||
    ['Bishop', 'Cleric', 'Chronomancer', 'Fateweaver', 'Blue/Spellcaster Type', 'Donovan'].includes(unit.className)
  );
}

function isBjornDoubleQuest(questName: string): boolean {
  return [
    'Ancient Crustacean',
    'Anubis Champion',
    'Cyclops General',
    'Cyclops Merchant',
    'Gold Golem',
    'Moonstone Golem',
    'Mushgoon Graverobber',
    'Runestone Golem',
    'Scholarly Harpy',
    'Sigil Ninja',
    'Toad Sage',
    'Training Instructor',
    'Troublin Blacksmith',
    'Troublin Pirate'
  ].some((name) => questName.includes(name));
}

function normalizeRessClassName(value: string): string {
  if (value === 'Berserker' || value === 'Jarl') {
    return 'Berserker/Jarl';
  }
  if (value === 'Dancer' || value === 'Acrobat') {
    return 'Dancer/Acrobat';
  }
  return value;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
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
