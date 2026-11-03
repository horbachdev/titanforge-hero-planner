import {
  calculateRessQuestSimulation,
  estimateQuestDefenseCap,
  getHeroSlotLimitForQuest,
  questToCombatInput,
  type CombatSpiritEffects,
  type CombatantInput,
  type RessMiniBossModifier,
  type RessQuestSimulation
} from './combat-engine';
import { formatZone } from './catalog';
import { calculateChampionBuildStats, calculateHeroStats } from './engine';
import type {
  BuildConfig,
  ChampionBuildConfig,
  ElementScores,
  GameData,
  QuestData,
  ResolvedBuild,
  ResolvedChampionBuild,
  ResolvedGearLine,
  StatBlock
} from './types';

/**
 * Team-level logic shared by the UI, the simulation worker and the LLM API.
 * Keeping this in one place guarantees that "simulate in the app" and
 * "simulate via the API" can never disagree.
 */

export const TEAM_HERO_SLOTS = 5;
export const MINI_BOSS_MODIFIERS: RessMiniBossModifier[] = ['None', 'Agile', 'Dire', 'Huge', 'Legendary'];
export const DEFAULT_SIMULATION_RUNS = 10000;
export const DEFAULT_SIMULATION_SEED = 9348677;

export interface TeamInput {
  heroes: Array<BuildConfig | null>;
  champion: ChampionBuildConfig | null;
}

export interface ResolvedTeam {
  /** Same length/order as the input; champion aura applied for display. */
  heroes: Array<ResolvedBuild | null>;
  champion: ResolvedChampionBuild | null;
  totals: StatBlock;
  elementScores: ElementScores;
  heroCount: number;
}

export function resolveTeam(team: TeamInput, data: GameData): ResolvedTeam {
  const champion = team.champion ? calculateChampionBuildStats(team.champion, data) : null;
  const heroes = team.heroes.map((build) => (build ? calculateHeroStats(build, data, { championSkillId: champion?.leaderSkill?.id }) : null));
  const present = heroes.filter((entry): entry is ResolvedBuild => Boolean(entry));
  return {
    heroes,
    champion,
    totals: sumStats([...present.map((entry) => entry.stats), ...(champion ? [champion.stats] : [])]),
    elementScores: mergeElementScores([...present.map((entry) => entry.elementScores), ...(champion ? [champion.elementScores] : [])]),
    heroCount: present.length
  };
}

export interface TeamSimulationRequest extends TeamInput {
  questId: string;
  miniBoss?: RessMiniBossModifier;
  /** Overrides the imported/estimated defense cap. */
  defenseCap?: number | null;
  runs?: number;
  seed?: number;
}

export interface TeamSimulationResult {
  quest: QuestData;
  simulation: RessQuestSimulation;
  defenseCap: number;
  defenseCapEstimated: boolean;
  heroSlotLimit: number;
  /** Names of heroes that do not fit into this quest's party size. */
  ignoredHeroes: string[];
  analysis: SimulationAnalysis;
}

export function simulateTeam(request: TeamSimulationRequest, data: GameData): TeamSimulationResult {
  const quest = data.quests.find((entry) => entry.id === request.questId);
  if (!quest) {
    throw new Error(`Unknown quest "${request.questId}".`);
  }

  const defenseCapEstimated = request.defenseCap == null && quest.defenseCap <= 0;
  const defenseCap = request.defenseCap ?? (quest.defenseCap || estimateQuestDefenseCap(quest));
  const heroSlotLimit = getHeroSlotLimitForQuest(quest);
  const activeBuilds = request.heroes.slice(0, heroSlotLimit).filter((build): build is BuildConfig => Boolean(build));
  const ignoredHeroes = request.heroes
    .slice(heroSlotLimit)
    .filter((build): build is BuildConfig => Boolean(build))
    .map((build) => build.name);

  // Champion auras are applied inside the Ress simulation itself, so heroes
  // are resolved *without* the aura here to avoid counting it twice.
  const heroes = activeBuilds.map((build) => calculateHeroStats(build, data));
  const champion = request.champion ? calculateChampionBuildStats(request.champion, data) : null;
  const simulation = calculateRessQuestSimulation(
    questToCombatInput(quest, defenseCap, request.miniBoss ?? 'None'),
    buildCombatants(heroes, champion),
    { runs: request.runs ?? DEFAULT_SIMULATION_RUNS, seed: request.seed ?? DEFAULT_SIMULATION_SEED }
  );

  const result = { quest, simulation, defenseCap, defenseCapEstimated, heroSlotLimit, ignoredHeroes };
  return { ...result, analysis: analyzeSimulation(result) };
}

export function buildCombatants(heroes: ResolvedBuild[], champion: ResolvedChampionBuild | null): CombatantInput[] {
  const championAurasong = champion?.gear.find((line) => line.slotId === 'aurasong' && line.itemId)?.itemName ?? '';
  return [
    ...(champion && champion.champion
      ? [
          {
            id: `champion-${champion.build.id}`,
            name: champion.build.name,
            kind: 'champion' as const,
            stats: champion.stats,
            elementScores: champion.elementScores,
            className: champion.champion.name,
            role: 'champion' as const,
            tier: champion.leaderSkill?.tier ?? 0,
            modifiers: champion.modifiers,
            combatEffects: { ...combatEffectsFromGear(champion.gear), aurasongName: championAurasong }
          }
        ]
      : []),
    ...heroes.map((resolved) => ({
      id: `hero-${resolved.build.id}`,
      name: resolved.build.name,
      kind: 'hero' as const,
      stats: resolved.stats,
      elementScores: resolved.elementScores,
      className: resolved.hero?.name,
      role: resolved.hero?.role ?? 'unknown',
      tier: ressInnateTier(resolved),
      modifiers: resolved.modifiers,
      combatEffects: combatEffectsFromGear(resolved.gear)
    }))
  ];
}

const COMBAT_ARTIFACTS = new Set([
  'Kiku-Ichimonji',
  'Pickaxe of Greed',
  'Lone Wolf Cowl',
  'Rock Stompers',
  'Backfire Hammer',
  'Torc of Peace',
  'Armor of Invincibility',
  'Wyrmbane Cannon',
  "Grimar's Collection"
]);

export function combatEffectsFromGear(gear: ResolvedGearLine[]): CombatSpiritEffects & { artifact?: string } {
  const effects: CombatSpiritEffects & { artifact?: string } = {
    armadillo: 0,
    lizard: 0,
    shark: 0,
    dinosaur: 0,
    mundra: 0,
    artifact: gear.find((line) => COMBAT_ARTIFACTS.has(line.itemName))?.itemName
  };

  for (const line of gear) {
    const spiritMultiplier = /^(Idol|Totem)$/i.test(line.itemType) ? 2 : 1;
    const affinityBonus = line.affinityBonuses.some((bonus) => /Ress matched spirit columns/i.test(bonus));
    for (const source of line.spiritSources) {
      const normalized = source.toLowerCase();
      if (normalized.includes('armadillo')) {
        effects.armadillo += (15 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('dinosaur')) {
        effects.dinosaur += (25 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('shark')) {
        effects.shark += (20 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('lizard') || normalized.includes('phoenix')) {
        effects.lizard += (3 + (affinityBonus ? 2 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('ouroboros') || normalized.includes('ouruboros')) {
        effects.lizard += (4 + (affinityBonus ? 2 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('mundra')) {
        effects.mundra += spiritMultiplier;
      }
    }
  }

  return effects;
}

function ressInnateTier(resolved: ResolvedBuild): number {
  return resolved.innateSkills[0]?.tier ?? (resolved.hero?.promoted ? 4 : 0);
}

// ---------------------------------------------------------------------------
// Plain-language analysis
// ---------------------------------------------------------------------------

export type VerdictLevel = 'reliable' | 'likely' | 'risky' | 'unlikely' | 'fails' | 'empty';
export type InsightSeverity = 'critical' | 'warning' | 'info' | 'success';

export interface SimulationInsight {
  severity: InsightSeverity;
  code: string;
  title: string;
  detail: string;
  unitId?: string;
}

export interface SimulationAnalysis {
  verdict: { level: VerdictLevel; label: string; headline: string; winRate: number };
  insights: SimulationInsight[];
}

const VERDICT_LABELS: Record<VerdictLevel, string> = {
  reliable: 'Reliable',
  likely: 'Likely win',
  risky: 'Risky',
  unlikely: 'Unlikely',
  fails: 'Fails',
  empty: 'No team'
};

export function verdictForWinRate(winRate: number, occupied: number): VerdictLevel {
  if (occupied === 0) {
    return 'empty';
  }
  if (winRate >= 95) {
    return 'reliable';
  }
  if (winRate >= 70) {
    return 'likely';
  }
  if (winRate >= 30) {
    return 'risky';
  }
  return winRate > 0 ? 'unlikely' : 'fails';
}

export function analyzeSimulation(result: Omit<TeamSimulationResult, 'analysis'>): SimulationAnalysis {
  const { simulation, quest } = result;
  const winRate = simulation.successRate;
  const level = verdictForWinRate(winRate, simulation.occupiedCombatants);
  const insights: SimulationInsight[] = [];
  const pct = (value: number) => `${Math.round(value * 10) / 10}%`;

  if (level === 'empty') {
    insights.push({
      severity: 'critical',
      code: 'empty-team',
      title: 'No heroes in this team',
      detail: 'Add at least one hero (and ideally a champion) to the team, then simulate again.'
    });
    return {
      verdict: { level, label: VERDICT_LABELS[level], headline: 'Add heroes to simulate this quest.', winRate },
      insights
    };
  }

  const { barrier } = simulation;
  if (barrier.required > 0 && !barrier.met) {
    const missing = Math.ceil(barrier.required - barrier.available);
    insights.push({
      severity: 'critical',
      code: 'barrier-short',
      title: `Barrier not broken — ${missing.toLocaleString('en-US')} ${formatElementList(barrier.types)} points missing`,
      detail: `Your team brings ${Math.floor(barrier.available).toLocaleString('en-US')} of ${barrier.required.toLocaleString('en-US')} required element points. While the barrier holds, your team deals only 20% damage. Add ${formatElementList(barrier.types)} elements to gear.`
    });
  }

  if (simulation.roundLimitRate >= 1) {
    insights.push({
      severity: simulation.roundLimitRate >= 25 ? 'critical' : 'warning',
      code: 'too-slow',
      title: `Fight times out in ${pct(simulation.roundLimitRate)} of runs`,
      detail: 'Your team survives but cannot finish the enemy within the round limit. More attack (or breaking the barrier) fixes this.'
    });
  }

  const fragile = [...simulation.rows].filter((row) => row.survivalRate < 90).sort((left, right) => left.survivalRate - right.survivalRate);
  const overwhelmed = simulation.rows.length > 1 && simulation.rows.every((row) => row.survivalRate < 5);
  if (overwhelmed) {
    const toughest = [...simulation.rows].sort(
      (left, right) => right.stats.hp / Math.max(1, right.damagePerHit) - left.stats.hp / Math.max(1, left.damagePerHit)
    )[0];
    insights.push({
      severity: 'critical',
      code: 'team-overwhelmed',
      title: 'The whole team is overwhelmed',
      detail: `Every unit falls in almost every fight. Even ${toughest.combatant.name} only survives about ${Math.max(1, Math.floor(toughest.stats.hp / Math.max(1, toughest.damagePerHit)))} hits (${toughest.damagePerHit.toLocaleString('en-US')} damage each). This quest needs much stronger gear or levels — try a lower difficulty first.`
    });
  }
  for (const row of overwhelmed ? [] : fragile.slice(0, 3)) {
    const takesShare = row.targetPercent >= (100 / Math.max(1, simulation.rows.length)) * 1.5;
    insights.push({
      severity: row.survivalRate < 50 ? 'critical' : 'warning',
      code: 'unit-falls',
      unitId: row.combatant.id,
      title: `${row.combatant.name} falls in ${pct(100 - row.survivalRate)} of runs`,
      detail: takesShare
        ? `Draws ${pct(row.targetPercent)} of enemy attacks and takes ${row.damagePerHit.toLocaleString('en-US')} damage per hit (${row.criticalDamagePerHit.toLocaleString('en-US')} on a crit). Raise DEF/HP, or move threat to a sturdier tank.`
        : `Takes ${row.damagePerHit.toLocaleString('en-US')} damage per hit with ${row.stats.hp.toLocaleString('en-US')} HP. More DEF (up to the quest's defense cap of ${result.defenseCap.toLocaleString('en-US')}) or HP helps.`
    });
  }

  const totalDamage = simulation.rows.reduce((total, row) => total + row.averageDamageDealt, 0);
  const carry = [...simulation.rows].sort((left, right) => right.averageDamageDealt - left.averageDamageDealt)[0];
  if (carry && totalDamage > 0 && simulation.rows.length > 1) {
    insights.push({
      severity: 'info',
      code: 'top-damage',
      unitId: carry.combatant.id,
      title: `${carry.combatant.name} deals ${pct((carry.averageDamageDealt / totalDamage) * 100)} of team damage`,
      detail: 'Losing this unit hurts the most. Keep it alive before adding more damage elsewhere.'
    });
  }

  if (result.ignoredHeroes.length > 0) {
    insights.push({
      severity: 'warning',
      code: 'slots-ignored',
      title: result.ignoredHeroes.length === 1 ? '1 hero sits this one out' : `${result.ignoredHeroes.length} heroes sit this one out`,
      detail: `${formatZone(quest.zone)} allows ${result.heroSlotLimit} heroes, so the last slots are skipped: ${result.ignoredHeroes.join(', ')}.${
        result.heroSlotLimit === 4 ? ' The 5th slot is only used in Lost City of Gold quests.' : ''
      } Reorder the team to choose who goes.`
    });
  }

  if (result.defenseCapEstimated && (level === 'likely' || level === 'risky' || level === 'unlikely')) {
    insights.push({
      severity: 'info',
      code: 'defense-cap-estimated',
      title: 'Defense cap is estimated',
      detail: 'No exact defense cap was imported for this quest. Enter the real value under "Advanced" for precise damage numbers.'
    });
  }

  if (level === 'reliable' && insights.every((insight) => insight.severity === 'info')) {
    insights.unshift({
      severity: 'success',
      code: 'all-good',
      title: 'Comfortable win',
      detail: 'Every unit is stable. Try the next difficulty or free up your strongest hero for another quest.'
    });
  }

  const headline =
    level === 'reliable'
      ? `Wins ${pct(winRate)} of ${simulation.simulations.toLocaleString('en-US')} simulated fights.`
      : level === 'fails'
        ? `Lost every one of ${simulation.simulations.toLocaleString('en-US')} simulated fights.`
        : `Wins ${pct(winRate)} of ${simulation.simulations.toLocaleString('en-US')} simulated fights — ${insights.find((insight) => insight.severity === 'critical')?.title ?? 'see the details below'}.`;

  return { verdict: { level, label: VERDICT_LABELS[level], headline, winRate }, insights };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function sumStats(stats: StatBlock[]): StatBlock {
  return stats.reduce(
    (acc, entry) => ({
      attack: acc.attack + entry.attack,
      defense: acc.defense + entry.defense,
      hp: acc.hp + entry.hp,
      evasion: acc.evasion + entry.evasion,
      critChance: acc.critChance + entry.critChance,
      critDamage: acc.critDamage + entry.critDamage,
      threat: acc.threat + entry.threat,
      power: acc.power + entry.power
    }),
    { attack: 0, defense: 0, hp: 0, evasion: 0, critChance: 0, critDamage: 0, threat: 0, power: 0 }
  );
}

export function mergeElementScores(scores: ElementScores[]): ElementScores {
  const merged: ElementScores = {};
  for (const entry of scores) {
    for (const [key, value] of Object.entries(entry)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

export const ELEMENT_LABELS: Record<string, string> = {
  fire: 'Fire',
  water: 'Water',
  air: 'Air',
  earth: 'Earth',
  light: 'Light',
  dark: 'Dark',
  luxurious: 'Gold',
  gold: 'Gold',
  all: 'Any',
  any: 'Any'
};

function formatElementList(types: string[]): string {
  const labels = [...new Set(types.map((type) => ELEMENT_LABELS[type] ?? type))];
  return labels.length <= 1 ? (labels[0] ?? 'element') : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}
