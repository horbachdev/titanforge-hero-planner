import { calculateChampionBuildStats, calculateHeroStats, getChampionMaxRank, getStarforgeStatMultiplier } from '../engine';
import { createId, emptyEquipmentForHero, ITEM_QUALITIES } from '../data-utils';
import { GameRepository, type EntityKind, type ResolveFailure, type ResolveMatch } from '../data/repository';
import type { LoadedGameData } from '../data/source';
import { DEFAULT_SIMULATION_RUNS, MINI_BOSS_MODIFIERS, resolveTeam, simulateTeam, type SimulationInsight } from '../team';
import type { RessMiniBossModifier } from '../combat-engine';
import type {
  BuildConfig,
  ChampionBuildConfig,
  EquipmentSelection,
  HeroData,
  ItemData,
  ItemQuality,
  QuestData,
  ResolvedBuild,
  ResolvedChampionBuild,
  SkillData,
  StatBlock
} from '../types';
import { formatZone, skillsForHero } from '../catalog';

/**
 * TitanForge Planner API — the machine-facing interface.
 *
 * Designed for LLM agents (via the MCP server or the CLI) but usable by any
 * program:
 *  - JSON in, JSON out. No classes, no functions, no circular data.
 *  - Inputs accept names *or* ids and are forgiving ("kiku ichimonji").
 *  - Every interpretation is reported back in `notes`, so the caller can
 *    correct itself. Ambiguous inputs fail with `suggestions` instead of
 *    silently guessing.
 *  - Results are compact and carry plain-language `insights`.
 *  - Outputs contain normalized `build` objects that can be pasted into the
 *    app's import dialog (and vice versa).
 */

export type Quality = ItemQuality;

export interface GearInput {
  /** 1–6 or a slot id like "slot-2". Omit to use the first fitting free slot. */
  slot?: number | string;
  /** Item name or id. */
  item: string;
  quality?: Quality;
  /** Element enchantment name or id, e.g. "Inferno" or "inferno-element". */
  element?: string;
  /** Spirit enchantment name or id, e.g. "Wolf". */
  spirit?: string;
  starforged?: boolean;
}

export interface HeroInput {
  /** Display name for this build. */
  name?: string;
  /** Class name or id. A promoted class name (e.g. "Mercenary") implies promoted: true. */
  heroClass: string;
  promoted?: boolean;
  /** 1–50, default 40. */
  level?: number;
  seeds?: { attack?: number; defense?: number; hp?: number };
  /** Up to 4 skill names or ids. */
  skills?: string[];
  gear?: GearInput[];
}

export interface ChampionInput {
  name?: string;
  /** Champion name or id, e.g. "Argon". */
  champion: string;
  /** Default: max rank. */
  rank?: number;
  level?: number;
  powerUps?: number;
  championSoul?: boolean;
  seeds?: { attack?: number; defense?: number; hp?: number };
  familiar?: Omit<GearInput, 'slot'>;
  aurasong?: Omit<GearInput, 'slot'>;
}

/** Either the lenient input or a build exported from the app. */
export type HeroBuildLike = HeroInput | BuildConfig;
export type ChampionBuildLike = ChampionInput | ChampionBuildConfig;

export type QuestRef = string | { zone: string; difficulty?: string; type?: 'Normal' | 'Boss' | string };

export interface SimulateInput {
  heroes: HeroBuildLike[];
  champion?: ChampionBuildLike | null;
  quest: QuestRef;
  miniBoss?: RessMiniBossModifier;
  defenseCap?: number;
  /** 100–50000, default 10000. */
  runs?: number;
  seed?: number;
}

export class PlannerError extends Error {
  constructor(
    readonly code: 'not_found' | 'ambiguous' | 'invalid_input' | 'not_allowed',
    message: string,
    readonly suggestions: string[] = []
  ) {
    super(message);
    this.name = 'PlannerError';
  }

  toJSON(): { error: { code: string; message: string; suggestions: string[] } } {
    return { error: { code: this.code, message: this.message, suggestions: this.suggestions } };
  }
}

export interface PlannerApi {
  repository: GameRepository;
  getDataInfo(): DataInfo;
  search(input: SearchInput): SearchResult;
  getDetails(input: { kind: EntityKind; id: string }): unknown;
  getHeroOptions(input: { heroClass: string; promoted?: boolean; level?: number }): HeroOptions;
  evaluateHero(input: HeroBuildLike): HeroEvaluation;
  evaluateChampion(input: ChampionBuildLike): ChampionEvaluation;
  evaluateTeam(input: { heroes: HeroBuildLike[]; champion?: ChampionBuildLike | null }): TeamEvaluation;
  simulateQuest(input: SimulateInput): QuestSimulationSummary;
  scanDifficulties(input: Omit<SimulateInput, 'quest'> & { zone: string; type?: string }): DifficultyScan;
}

export function createPlannerApi(loaded: LoadedGameData | GameRepository): PlannerApi {
  const repo = loaded instanceof GameRepository ? loaded : new GameRepository(loaded.data);
  const sourceLabel = loaded instanceof GameRepository ? 'in-memory' : loaded.source.label;
  const data = repo.data;

  // -------------------------------------------------------------------------
  // Resolution helpers
  // -------------------------------------------------------------------------

  function resolveOrThrow<K extends EntityKind>(
    kind: K,
    input: string,
    notes: string[],
    filter?: Parameters<GameRepository['resolve']>[2],
    context = kind
  ) {
    if (typeof input !== 'string' || !input.trim()) {
      throw new PlannerError('invalid_input', `Expected a ${context} name or id.`);
    }
    const result = repo.resolve(kind, input, filter as never);
    if (result.entity === null) {
      const failure = result as ResolveFailure;
      throw new PlannerError(
        failure.ambiguous ? 'ambiguous' : 'not_found',
        failure.ambiguous ? `"${input}" matches several ${context}s. Use the exact name or id.` : `No ${context} named "${input}".`,
        failure.suggestions
      );
    }
    const match = result as ResolveMatch<NonNullable<typeof result.entity>>;
    if (match.matchedBy === 'partial' || match.matchedBy === 'alias' || match.matchedBy === 'normalized') {
      const name = (match.entity as { name?: string }).name ?? (match.entity as { id: string }).id;
      if (!isTrivialMatch(name, input)) {
        notes.push(`Interpreted ${context} "${input}" as "${name}".`);
      }
    }
    return match.entity;
  }

  function resolveEnchantment(type: 'Element' | 'Spirit', input: string | undefined, notes: string[]): string {
    if (!input) {
      return '';
    }
    return resolveOrThrow('enchantment', input, notes, (entry) => (entry as { type: string }).type === type, type.toLowerCase() as EntityKind).id;
  }

  function quality(input: string | undefined, notes: string[]): ItemQuality {
    if (!input) {
      return 'normal';
    }
    const normalized = input.toLowerCase() as ItemQuality;
    if (ITEM_QUALITIES.includes(normalized)) {
      return normalized;
    }
    notes.push(`Unknown quality "${input}", used "normal". Valid: ${ITEM_QUALITIES.join(', ')}.`);
    return 'normal';
  }

  function isBuildConfig(value: unknown): value is BuildConfig {
    return Boolean(value && typeof value === 'object' && (value as BuildConfig).schemaVersion === 1 && 'heroClassId' in value);
  }

  function isChampionBuildConfig(value: unknown): value is ChampionBuildConfig {
    return Boolean(value && typeof value === 'object' && (value as ChampionBuildConfig).schemaVersion === 1 && 'championId' in value);
  }

  function toHeroBuild(input: HeroBuildLike, notes: string[]): BuildConfig {
    if (isBuildConfig(input)) {
      return input;
    }
    if (!input || typeof input !== 'object') {
      throw new PlannerError('invalid_input', 'A hero must be an object like {"heroClass": "Soldier", ...}.');
    }
    const classMatch = resolveOrThrow('hero', input.heroClass, notes, undefined, 'hero' as EntityKind) as HeroData;
    const base = repo.hero(classMatch.baseClassId) ?? classMatch;
    const promoted = input.promoted ?? classMatch.promoted;
    if (promoted && !base.promotedClassId) {
      throw new PlannerError('not_allowed', `${base.name} has no promotion.`);
    }
    const hero = promoted ? (repo.hero(base.promotedClassId) ?? base) : base;
    const level = clampInt(input.level ?? 40, 1, 50, 'level', notes);
    const maxTier = repo.maxTierForLevel(level);

    const allowedSkills = skillsForHero(data, hero);
    const skills = (input.skills ?? [])
      .slice(0, 4)
      .map((skillName) => resolveOrThrow('skill', skillName, notes, (skill) => allowedSkills.includes(skill as SkillData), 'skill' as EntityKind).id);
    if ((input.skills ?? []).length > 4) {
      notes.push('Only the first 4 skills were used (heroes have 4 skill slots).');
    }

    const equipment = emptyEquipmentForHero(hero);
    for (const gear of input.gear ?? []) {
      placeGear(hero, equipment, gear, maxTier, notes);
    }

    return {
      schemaVersion: 1,
      id: createId('build'),
      name: input.name?.trim() || `${hero.name} Lv${level}`,
      heroClassId: base.id,
      promoted: hero.id !== base.id,
      level,
      seeds: {
        attack: clampInt(input.seeds?.attack ?? 0, 0, 999, 'attack seeds', notes),
        defense: clampInt(input.seeds?.defense ?? 0, 0, 999, 'defense seeds', notes),
        hp: clampInt(input.seeds?.hp ?? 0, 0, 999, 'hp seeds', notes)
      },
      skills: [...skills, '', '', '', ''].slice(0, 4),
      equipment
    };
  }

  function placeGear(hero: HeroData, equipment: EquipmentSelection[], gear: GearInput, maxTier: number, notes: string[]): void {
    let slotIndex = -1;
    if (gear.slot !== undefined) {
      slotIndex = typeof gear.slot === 'number' ? gear.slot - 1 : hero.slots.findIndex((slot) => slot.id === gear.slot || slot.label === gear.slot);
      if (slotIndex < 0 || slotIndex >= hero.slots.length) {
        throw new PlannerError('invalid_input', `Slot "${gear.slot}" does not exist. ${hero.name} has slots 1–${hero.slots.length}.`);
      }
    }

    const allowedTypes = slotIndex >= 0 ? hero.slots[slotIndex].allowedTypes : hero.slots.flatMap((slot) => slot.allowedTypes);
    let item: ItemData;
    try {
      item = resolveOrThrow('item', gear.item, notes, (entry) => allowedTypes.includes((entry as ItemData).type), 'item' as EntityKind) as ItemData;
    } catch (error) {
      const anyItem = repo.resolve('item', gear.item);
      if (anyItem.entity) {
        throw new PlannerError(
          'not_allowed',
          `${anyItem.entity.name} is a ${anyItem.entity.type}; ${hero.name}${slotIndex >= 0 ? ` slot ${slotIndex + 1}` : ''} accepts ${[...new Set(allowedTypes)].join(', ')}.`
        );
      }
      throw error;
    }

    if (slotIndex < 0) {
      slotIndex = hero.slots.findIndex((slot, index) => slot.allowedTypes.includes(item.type) && !equipment[index].itemId);
      if (slotIndex < 0) {
        throw new PlannerError('not_allowed', `No free slot for ${item.name} (${item.type}) on ${hero.name}.`);
      }
    }
    if (equipment[slotIndex].itemId) {
      notes.push(`Slot ${slotIndex + 1} was given twice; kept ${item.name}.`);
    }
    if (item.tier > maxTier) {
      notes.push(`${item.name} is T${item.tier}, above the T${maxTier} cap for this level (the game would not allow it).`);
    }
    const starforged = Boolean(gear.starforged);
    if (starforged && getStarforgeStatMultiplier(item) <= 1) {
      notes.push(`${item.name} has no Starforge stat bonus; starforged ignored.`);
    }
    equipment[slotIndex] = {
      slotId: hero.slots[slotIndex].id,
      itemId: item.id,
      quality: quality(gear.quality, notes),
      elementId: item.builtInElement ? '' : resolveEnchantment('Element', gear.element, notes),
      spiritId: item.builtInSpirit ? '' : resolveEnchantment('Spirit', gear.spirit, notes),
      starforged: starforged && getStarforgeStatMultiplier(item) > 1
    };
    if (item.builtInElement && gear.element) {
      notes.push(`${item.name} has the built-in element "${item.builtInElement}"; "${gear.element}" ignored.`);
    }
    if (item.builtInSpirit && gear.spirit) {
      notes.push(`${item.name} has the built-in spirit "${item.builtInSpirit}"; "${gear.spirit}" ignored.`);
    }
  }

  function toChampionBuild(input: ChampionBuildLike, notes: string[]): ChampionBuildConfig {
    if (isChampionBuildConfig(input)) {
      return input;
    }
    if (!input || typeof input !== 'object') {
      throw new PlannerError('invalid_input', 'A champion must be an object like {"champion": "Argon"}.');
    }
    const champion = resolveOrThrow('champion', input.champion, notes);
    const maxRank = getChampionMaxRank(champion as never);
    const championGear = (gear: Omit<GearInput, 'slot'> | undefined, slotId: 'familiar' | 'aurasong', type: string): EquipmentSelection => {
      if (!gear?.item) {
        return { slotId, itemId: '', quality: 'normal', elementId: '', spiritId: '', starforged: false };
      }
      const item = resolveOrThrow(
        'item',
        gear.item,
        notes,
        (entry) => (entry as ItemData).type === type,
        type.toLowerCase() as EntityKind
      ) as ItemData;
      return {
        slotId,
        itemId: item.id,
        quality: quality(gear.quality, notes),
        elementId: item.builtInElement ? '' : resolveEnchantment('Element', gear.element, notes),
        spiritId: item.builtInSpirit ? '' : resolveEnchantment('Spirit', gear.spirit, notes),
        starforged: Boolean(gear.starforged) && getStarforgeStatMultiplier(item) > 1
      };
    };
    return {
      schemaVersion: 1,
      id: createId('champion'),
      name: input.name?.trim() || (champion as { name: string }).name,
      championId: (champion as { id: string }).id,
      rank: clampInt(input.rank ?? maxRank, 1, maxRank, 'rank', notes),
      level: clampInt(input.level ?? 40, 1, 50, 'level', notes),
      powerUps: clampInt(input.powerUps ?? 0, 0, 999, 'powerUps', notes),
      championSoul: input.championSoul ?? false,
      seeds: {
        attack: clampInt(input.seeds?.attack ?? 0, 0, 999, 'attack seeds', notes),
        defense: clampInt(input.seeds?.defense ?? 0, 0, 999, 'defense seeds', notes),
        hp: clampInt(input.seeds?.hp ?? 0, 0, 999, 'hp seeds', notes)
      },
      familiar: championGear(input.familiar, 'familiar', 'Familiar'),
      aurasong: championGear(input.aurasong, 'aurasong', 'Aurasong')
    };
  }

  function resolveQuest(ref: QuestRef, notes: string[]): QuestData {
    if (typeof ref === 'string') {
      const byId = repo.quest(ref);
      if (byId) {
        return byId;
      }
      return resolveOrThrow('quest', ref, notes) as QuestData;
    }
    if (!ref || typeof ref !== 'object' || !ref.zone) {
      throw new PlannerError('invalid_input', 'quest must be an id or {"zone": "...", "difficulty": "Hard", "type": "Normal"}.');
    }
    const zoneMatches = repo.data.quests.filter((quest) => sameZone(quest.zone, ref.zone));
    if (zoneMatches.length === 0) {
      const zones = [...new Set(repo.search('quest', ref.zone, { limit: 20 }).map((quest) => formatZone(quest.zone)))];
      throw new PlannerError('not_found', `No quest zone "${ref.zone}".`, zones.slice(0, 8));
    }
    const type = ref.type ?? (zoneMatches.some((quest) => quest.type === 'Normal') ? 'Normal' : zoneMatches[0].type);
    const difficulty = ref.difficulty ?? 'Easy';
    const quest = zoneMatches.find(
      (entry) => entry.type.toLowerCase() === type.toLowerCase() && entry.difficulty.toLowerCase() === difficulty.toLowerCase()
    );
    if (!quest) {
      throw new PlannerError(
        'not_found',
        `${formatZone(zoneMatches[0].zone)} has no ${type} ${difficulty} quest.`,
        zoneMatches.map((entry) => `${entry.type} ${entry.difficulty} (id: ${entry.id})`)
      );
    }
    if (!ref.type && zoneMatches.some((entry) => entry.type !== type)) {
      notes.push(`Used the ${type} variant of ${formatZone(quest.zone)}; pass "type": "Boss" for the boss fight.`);
    }
    return quest;
  }

  function sameZone(left: string, right: string): boolean {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(left) === normalize(right);
  }

  // -------------------------------------------------------------------------
  // Output shaping
  // -------------------------------------------------------------------------

  function heroSummary(resolved: ResolvedBuild) {
    return {
      name: resolved.build.name,
      class: resolved.hero?.name ?? resolved.build.heroClassId,
      level: resolved.build.level,
      stats: compactStats(resolved.stats),
      elementPoints: resolved.elementScores,
      innate: resolved.innateSkills.map((skill) => skill.name),
      championAura: resolved.championSkill?.name ?? null,
      gear: resolved.gear.map((line) => ({
        slot: line.slotLabel,
        item: line.itemId ? `${line.itemName} (T${line.itemTier} ${line.itemType})` : null,
        quality: line.itemId ? line.quality : undefined,
        element: line.elementSources[0] ?? undefined,
        spirit: line.spiritSources[0] ?? undefined,
        starforged: line.starforged || undefined
      })),
      warnings: resolved.warnings
    };
  }

  function championSummary(resolved: ResolvedChampionBuild) {
    return {
      name: resolved.build.name,
      champion: resolved.champion?.name ?? resolved.build.championId,
      rank: resolved.build.rank,
      championSoul: resolved.build.championSoul,
      aura: resolved.leaderSkill ? { name: resolved.leaderSkill.name, effect: resolved.leaderSkill.effect } : null,
      stats: compactStats(resolved.stats),
      elementPoints: resolved.elementScores,
      familiar: resolved.gear.find((line) => line.slotId === 'familiar')?.itemName ?? null,
      aurasong: resolved.gear.find((line) => line.slotId === 'aurasong')?.itemName ?? null,
      warnings: resolved.warnings
    };
  }

  // -------------------------------------------------------------------------
  // Public methods
  // -------------------------------------------------------------------------

  const api: PlannerApi = {
    repository: repo,

    getDataInfo() {
      return {
        gameVersion: data.metadata.officialSpreadsheetVersion,
        simulatorReference: `Ress Hero & Quest Simulator ${data.metadata.ressSpreadsheetVersion}`,
        generatedAt: data.metadata.generatedAt,
        source: sourceLabel,
        counts: {
          heroClasses: data.heroes.length,
          items: data.items.length,
          skills: data.skills.length,
          champions: data.champions.length,
          enchantments: data.enchantments.length,
          quests: data.quests.length
        },
        conventions: {
          qualities: ITEM_QUALITIES,
          miniBossModifiers: MINI_BOSS_MODIFIERS,
          difficulties: ['Easy', 'Medium', 'Hard', 'Extreme'],
          percentages: 'evasion and critChance are percentage points (5 = 5%); critDamage is a multiplier (2 = 2x)'
        }
      };
    },

    search({ kind, query = '', type, maxTier, heroClass, limit = 20 }) {
      const cappedLimit = Math.max(1, Math.min(100, limit));
      if (kind === 'item') {
        const allowed = heroClass ? heroAllowedTypes(heroClass) : null;
        const results = repo.search('item', query, {
          limit: cappedLimit,
          filter: (item) =>
            (!type || item.type.toLowerCase() === type.toLowerCase()) && (!maxTier || item.tier <= maxTier) && (!allowed || allowed.has(item.type))
        });
        return {
          kind,
          results: results.map((item) => ({ id: item.id, name: item.name, type: item.type, tier: item.tier, stats: nonZero({ ...item.stats }) }))
        };
      }
      if (kind === 'skill') {
        const hero = heroClass ? (resolveOrThrow('hero', heroClass, []) as HeroData) : null;
        const allowed = hero ? new Set(skillsForHero(data, hero).map((skill) => skill.id)) : null;
        const results = repo.search('skill', query, {
          limit: cappedLimit,
          filter: (skill) => (!type || skill.type.toLowerCase() === type.toLowerCase()) && (!allowed || allowed.has(skill.id))
        });
        return {
          kind,
          results: results.map((skill) => ({ id: skill.id, name: skill.name, type: skill.type, tier: skill.tier, effect: skill.effect }))
        };
      }
      if (kind === 'quest') {
        const results = repo.search('quest', query, {
          limit: cappedLimit,
          filter: (quest) => !type || quest.type.toLowerCase() === type.toLowerCase()
        });
        return { kind, results: results.map(questSummary) };
      }
      if (kind === 'hero') {
        return {
          kind,
          results: repo.search('hero', query, { limit: cappedLimit }).map((hero) => ({
            id: hero.id,
            name: hero.name,
            role: hero.role,
            promoted: hero.promoted,
            baseClass: hero.baseClassName,
            element: hero.element
          }))
        };
      }
      if (kind === 'champion') {
        return {
          kind,
          results: repo
            .search('champion', query, { limit: cappedLimit })
            .map((champion) => ({ id: champion.id, name: champion.name, element: champion.element }))
        };
      }
      if (kind === 'enchantment') {
        return {
          kind,
          results: repo
            .search('enchantment', query, { limit: cappedLimit, filter: (entry) => !type || entry.type.toLowerCase() === type.toLowerCase() })
            .map((entry) => ({ id: entry.id, name: entry.name, type: entry.type, elementPoints: entry.elementScores }))
        };
      }
      throw new PlannerError('invalid_input', `Unknown kind "${kind}". Use hero, item, skill, champion, enchantment or quest.`);
    },

    getDetails({ kind, id }) {
      const entity = resolveOrThrow(kind, id, []);
      if (kind === 'hero') {
        const hero = entity as HeroData;
        return {
          ...hero,
          slots: hero.slots.map((slot, index) => ({ slot: index + 1, id: slot.id, accepts: slot.allowedTypes })),
          innateSkills: hero.innateSkillIds.map((skillId) => repo.skill(skillId)).filter(Boolean)
        };
      }
      if (kind === 'quest') {
        return questSummary(entity as QuestData);
      }
      return entity;
    },

    getHeroOptions({ heroClass, promoted, level = 40 }) {
      const notes: string[] = [];
      const match = resolveOrThrow('hero', heroClass, notes) as HeroData;
      const base = repo.hero(match.baseClassId) ?? match;
      const hero = (promoted ?? match.promoted) && base.promotedClassId ? (repo.hero(base.promotedClassId) ?? base) : base;
      const maxTier = repo.maxTierForLevel(level);
      return {
        class: hero.name,
        baseClass: base.name,
        promotedClass: base.promotedClassName || null,
        role: hero.role,
        element: hero.element,
        maxItemTier: maxTier,
        innate: hero.innateSkillIds.map((skillId) => repo.skill(skillId)?.name).filter(Boolean) as string[],
        slots: hero.slots.map((slot, index) => ({
          slot: index + 1,
          accepts: slot.allowedTypes,
          strongestItems: data.items
            .filter((item) => slot.allowedTypes.includes(item.type) && item.tier <= maxTier)
            .sort((left, right) => right.tier - left.tier || right.value - left.value)
            .slice(0, 5)
            .map((item) => `${item.name} (T${item.tier} ${item.type})`)
        })),
        skillCount: skillsForHero(data, hero).length,
        notes
      };
    },

    evaluateHero(input) {
      const notes: string[] = [];
      const build = toHeroBuild(input, notes);
      const resolved = calculateHeroStats(build, data);
      return { ...heroSummary(resolved), notes, build };
    },

    evaluateChampion(input) {
      const notes: string[] = [];
      const build = toChampionBuild(input, notes);
      const resolved = calculateChampionBuildStats(build, data);
      return { ...championSummary(resolved), notes, build };
    },

    evaluateTeam({ heroes, champion }) {
      const notes: string[] = [];
      if (!Array.isArray(heroes) || heroes.length === 0) {
        throw new PlannerError('invalid_input', 'heroes must be a non-empty array.');
      }
      if (heroes.length > 5) {
        throw new PlannerError('invalid_input', 'A team has at most 5 heroes.');
      }
      const heroBuilds = heroes.map((hero) => toHeroBuild(hero, notes));
      const championBuild = champion ? toChampionBuild(champion, notes) : null;
      const team = resolveTeam({ heroes: heroBuilds, champion: championBuild }, data);
      return {
        heroes: team.heroes.filter((entry): entry is ResolvedBuild => Boolean(entry)).map(heroSummary),
        champion: team.champion ? championSummary(team.champion) : null,
        totals: compactStats(team.totals),
        elementPoints: team.elementScores,
        notes,
        builds: { heroes: heroBuilds, champion: championBuild }
      };
    },

    simulateQuest(input) {
      const notes: string[] = [];
      if (!Array.isArray(input.heroes) || input.heroes.length === 0) {
        throw new PlannerError('invalid_input', 'heroes must be a non-empty array.');
      }
      if (input.heroes.length > 5) {
        throw new PlannerError('invalid_input', 'A team has at most 5 heroes.');
      }
      const quest = resolveQuest(input.quest, notes);
      const heroBuilds = input.heroes.map((hero) => toHeroBuild(hero, notes));
      const championBuild = input.champion ? toChampionBuild(input.champion, notes) : null;
      const miniBoss = input.miniBoss && MINI_BOSS_MODIFIERS.includes(input.miniBoss) ? input.miniBoss : 'None';
      if (input.miniBoss && miniBoss !== input.miniBoss) {
        notes.push(`Unknown miniBoss "${input.miniBoss}", used "None". Valid: ${MINI_BOSS_MODIFIERS.join(', ')}.`);
      }
      const runs = clampInt(input.runs ?? DEFAULT_SIMULATION_RUNS, 100, 50000, 'runs', notes);
      const result = simulateTeam(
        { heroes: heroBuilds, champion: championBuild, questId: quest.id, miniBoss, defenseCap: input.defenseCap ?? null, runs, seed: input.seed },
        data
      );
      const sim = result.simulation;
      return {
        quest: { ...questSummary(quest), defenseCap: result.defenseCap, defenseCapEstimated: result.defenseCapEstimated, miniBoss },
        verdict: result.analysis.verdict,
        insights: result.analysis.insights,
        rounds: { min: sim.minimumRounds, average: round2(sim.averageRounds), max: sim.maximumRounds },
        barrier:
          sim.barrier.required > 0
            ? { elements: sim.barrier.types, required: sim.barrier.required, available: round2(sim.barrier.available), broken: sim.barrier.met }
            : null,
        enemy: {
          hp: sim.enemy.hp,
          attack: sim.enemy.attack,
          critChance: sim.enemy.critChance,
          evasion: sim.enemy.evasion,
          aoeChance: sim.enemy.aoeChance
        },
        units: sim.rows.map((row) => ({
          name: row.combatant.name,
          kind: row.combatant.kind,
          class: row.combatant.className,
          survivalRate: round2(row.survivalRate),
          targetedPercent: round2(row.targetPercent),
          damageTakenPerHit: row.damagePerHit,
          critDamageTakenPerHit: row.criticalDamagePerHit,
          averageDamageDealt: Math.round(row.averageDamageDealt),
          averageHpLeft: Math.round(row.averageHpRemaining),
          stats: compactStats(row.stats)
        })),
        ignoredHeroes: result.ignoredHeroes,
        runs: sim.simulations,
        notes,
        disclaimer: "Monte Carlo port of Ress' community simulator; not affiliated with Kabam. Treat win rates as estimates."
      };
    },

    scanDifficulties(input) {
      const notes: string[] = [];
      const runs = clampInt(input.runs ?? 2000, 100, 20000, 'runs', notes);
      const probe = resolveQuest({ zone: input.zone, type: input.type, difficulty: 'Easy' }, notes);
      const variants = data.quests.filter((quest) => quest.zone === probe.zone && quest.type === probe.type);
      const heroBuilds = input.heroes.map((hero) => toHeroBuild(hero, notes));
      const championBuild = input.champion ? toChampionBuild(input.champion, notes) : null;
      const results = variants.map((quest) => {
        const result = simulateTeam(
          { heroes: heroBuilds, champion: championBuild, questId: quest.id, miniBoss: input.miniBoss ?? 'None', runs, seed: input.seed },
          data
        );
        return {
          questId: quest.id,
          difficulty: quest.difficulty,
          winRate: round2(result.simulation.successRate),
          verdict: result.analysis.verdict.label,
          topIssue: firstProblem(result.analysis.insights)
        };
      });
      const hardestReliable = [...results].reverse().find((entry) => entry.winRate >= 95)?.difficulty ?? null;
      return { zone: formatZone(probe.zone), type: probe.type, runsPerDifficulty: runs, results, hardestReliable, notes };
    }
  };

  function heroAllowedTypes(heroClass: string): Set<string> {
    const hero = resolveOrThrow('hero', heroClass, []) as HeroData;
    return new Set(hero.slots.flatMap((slot) => slot.allowedTypes));
  }

  return api;
}

// ---------------------------------------------------------------------------
// Result types (kept explicit so they show up in generated docs/schemas)
// ---------------------------------------------------------------------------

export interface DataInfo {
  gameVersion: string;
  simulatorReference: string;
  generatedAt: string;
  source: string;
  counts: Record<string, number>;
  conventions: Record<string, unknown>;
}

export interface SearchInput {
  kind: EntityKind;
  query?: string;
  /** Item type ("Sword"), skill type ("Leader"), enchantment type ("Spirit") or quest type ("Boss"). */
  type?: string;
  maxTier?: number;
  /** Restrict items/skills to what this class can use. */
  heroClass?: string;
  limit?: number;
}

export interface SearchResult {
  kind: EntityKind;
  results: unknown[];
}

export interface HeroOptions {
  class: string;
  baseClass: string;
  promotedClass: string | null;
  role: string;
  element: string;
  maxItemTier: number;
  innate: string[];
  slots: Array<{ slot: number; accepts: string[]; strongestItems: string[] }>;
  skillCount: number;
  notes: string[];
}

export type HeroEvaluation = Record<string, unknown> & { notes: string[]; build: BuildConfig };
export type ChampionEvaluation = Record<string, unknown> & { notes: string[]; build: ChampionBuildConfig };

export interface TeamEvaluation {
  heroes: unknown[];
  champion: unknown;
  totals: Record<string, number>;
  elementPoints: Record<string, number>;
  notes: string[];
  builds: { heroes: BuildConfig[]; champion: ChampionBuildConfig | null };
}

export interface QuestSimulationSummary {
  quest: Record<string, unknown>;
  verdict: { level: string; label: string; headline: string; winRate: number };
  insights: SimulationInsight[];
  rounds: { min: number; average: number; max: number };
  barrier: { elements: string[]; required: number; available: number; broken: boolean } | null;
  enemy: Record<string, number>;
  units: Array<Record<string, unknown>>;
  ignoredHeroes: string[];
  runs: number;
  notes: string[];
  disclaimer: string;
}

export interface DifficultyScan {
  zone: string;
  type: string;
  runsPerDifficulty: number;
  results: Array<{ questId: string; difficulty: string; winRate: number; verdict: string; topIssue: string | null }>;
  hardestReliable: string | null;
  notes: string[];
}

function questSummary(quest: QuestData) {
  return {
    id: quest.id,
    zone: formatZone(quest.zone),
    type: quest.type,
    difficulty: quest.difficulty,
    partySize: quest.lcog ? 5 : Math.min(4, quest.partySize || 4),
    enemyHp: quest.enemyHealth,
    enemyAttack: quest.enemyDamage,
    aoe: quest.aoeDamage > 0 ? { damage: quest.aoeDamage, chancePercent: quest.aoeChance } : null,
    barrier: quest.barrierHealth > 0 ? { elements: quest.barrierOptions.filter((entry) => entry !== 'None'), points: quest.barrierHealth } : null,
    flags: [quest.isBoss && 'boss', quest.isExtreme && 'extreme', quest.lcog && 'lost-city-of-gold'].filter(Boolean)
  };
}

function compactStats(stats: StatBlock): Record<string, number> {
  return {
    hp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    critChance: stats.critChance,
    critDamage: stats.critDamage,
    evasion: stats.evasion,
    threat: stats.threat,
    power: stats.power
  };
}

function nonZero(stats: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(stats).filter(([, value]) => value));
}

function firstProblem(insights: SimulationInsight[]): string | null {
  return insights.find((insight) => insight.severity === 'critical' || insight.severity === 'warning')?.title ?? null;
}

/** "Inferno" → "Inferno Element" or "kiku-ichimonji" → "Kiku-Ichimonji" are not worth a note. */
function isTrivialMatch(name: string, input: string): boolean {
  const strip = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(element|spirit)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  return strip(name) === strip(input);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampInt(value: number, min: number, max: number, label: string, notes: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlannerError('invalid_input', `${label} must be a number.`);
  }
  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  if (clamped !== value) {
    notes.push(`${label} ${value} adjusted to ${clamped} (allowed ${min}–${max}).`);
  }
  return clamped;
}
