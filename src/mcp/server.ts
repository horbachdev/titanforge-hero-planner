#!/usr/bin/env node
/**
 * TitanForge MCP server — lets LLM assistants (Claude Desktop, Claude Code,
 * any MCP client) plan Shop Titans heroes and simulate quests.
 *
 *   pnpm mcp                              # stdio server with bundled data
 *   TITANFORGE_DATA=path/to/data.json pnpm mcp
 *   TITANFORGE_DATA_URL=https://…/game-data.json pnpm mcp
 *
 * Every tool is a thin wrapper around `createPlannerApi` (src/shared/api),
 * so the app, the CLI and the MCP server always compute the same numbers.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPlannerApi, PlannerError } from '../shared/api/planner';
import { createNodeDataSource } from '../shared/data/node';
import { loadGameData } from '../shared/data/source';

const qualities = z.enum(['normal', 'superior', 'flawless', 'epic', 'legendary']);

const gearSchema = z.object({
  slot: z
    .union([z.number().int().min(1).max(6), z.string()])
    .optional()
    .describe('1–6. Omit to use the first free slot that accepts the item.'),
  item: z.string().describe('Item name or id, e.g. "Kiku-Ichimonji".'),
  quality: qualities.optional().describe('Default "normal".'),
  element: z.string().optional().describe('Element enchantment, e.g. "Inferno" or "Gaia Element".'),
  spirit: z.string().optional().describe('Spirit enchantment, e.g. "Wolf".'),
  starforged: z.boolean().optional()
});

const heroSchema = z
  .object({
    name: z.string().optional(),
    heroClass: z.string().describe('Class name or id. A promoted name like "Mercenary" implies promoted.'),
    promoted: z.boolean().optional(),
    level: z.number().int().min(1).max(50).optional().describe('Default 40.'),
    seeds: z.object({ attack: z.number().optional(), defense: z.number().optional(), hp: z.number().optional() }).optional(),
    skills: z.array(z.string()).max(4).optional().describe('Skill names or ids.'),
    gear: z.array(gearSchema).max(6).optional()
  })
  .passthrough()
  .describe('A hero build. Builds exported from the TitanForge app (schemaVersion 1) are accepted too.');

const championSchema = z
  .object({
    name: z.string().optional(),
    champion: z.string().describe('Champion name, e.g. "Argon".'),
    rank: z.number().int().optional().describe('Default: max rank.'),
    level: z.number().int().optional(),
    powerUps: z.number().int().optional(),
    championSoul: z.boolean().optional(),
    familiar: gearSchema.omit({ slot: true }).optional(),
    aurasong: gearSchema.omit({ slot: true }).optional()
  })
  .passthrough();

const questSchema = z
  .union([
    z.string().describe('Quest id, e.g. "howling-woods-normal-hard".'),
    z.object({
      zone: z.string().describe('Zone name, e.g. "Howling Woods" or "Lost City of Gold Diff 9".'),
      difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Extreme']).optional(),
      type: z.enum(['Normal', 'Boss']).optional()
    })
  ])
  .describe('Which quest to fight.');

const teamShape = {
  heroes: z.array(heroSchema).min(1).max(5).describe('Up to 5 heroes. Only Lost City of Gold quests use the 5th.'),
  champion: championSchema.nullable().optional()
};

async function main(): Promise<void> {
  const loaded = await loadGameData(createNodeDataSource());
  const api = createPlannerApi(loaded);
  const server = new McpServer({ name: 'titanforge', version: '0.2.0' });

  const tool = <T>(name: string, title: string, description: string, inputSchema: Record<string, z.ZodTypeAny>, run: (input: T) => unknown) =>
    server.registerTool(name, { title, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } }, async (input) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(run(input as T), null, 2) }] };
      } catch (error) {
        const payload = error instanceof PlannerError ? error.toJSON() : { error: { code: 'internal', message: String(error) } };
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      }
    });

  tool('get_data_info', 'Data info', 'Game data version, entity counts and value conventions. Call once to orient yourself.', {}, () =>
    api.getDataInfo()
  );

  tool(
    'search',
    'Search the catalog',
    'Find heroes, items, skills, champions, enchantments or quests by (partial) name. Use heroClass to only list items/skills that class can use.',
    {
      kind: z.enum(['hero', 'item', 'skill', 'champion', 'enchantment', 'quest']),
      query: z.string().optional(),
      type: z.string().optional().describe('Item type ("Sword"), skill type, enchantment type ("Element"/"Spirit") or quest type ("Boss").'),
      maxTier: z.number().int().optional(),
      heroClass: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional()
    },
    (input: Parameters<typeof api.search>[0]) => api.search(input)
  );

  tool(
    'get_details',
    'Entity details',
    'Full data for one entity (stats, slots, effects, rank rewards…).',
    { kind: z.enum(['hero', 'item', 'skill', 'champion', 'enchantment', 'quest']), id: z.string().describe('Id or name.') },
    (input: Parameters<typeof api.getDetails>[0]) => api.getDetails(input)
  );

  tool(
    'get_hero_options',
    'Hero options',
    'What a class can equip at a level: slot item types, strongest items per slot, tier cap, innate skill.',
    { heroClass: z.string(), promoted: z.boolean().optional(), level: z.number().int().min(1).max(50).optional() },
    (input: Parameters<typeof api.getHeroOptions>[0]) => api.getHeroOptions(input)
  );

  tool(
    'evaluate_hero',
    'Evaluate hero',
    'Final stats, power and element points for one hero build. Returns a normalized build for the app.',
    { hero: heroSchema },
    (input: { hero: Parameters<typeof api.evaluateHero>[0] }) => api.evaluateHero(input.hero)
  );

  tool(
    'evaluate_champion',
    'Evaluate champion',
    'Stats and party aura of a champion build.',
    { champion: championSchema },
    (input: { champion: Parameters<typeof api.evaluateChampion>[0] }) => api.evaluateChampion(input.champion)
  );

  tool(
    'evaluate_team',
    'Evaluate team',
    'Stats of every hero with the champion aura applied, plus team totals and element points.',
    teamShape,
    (input: Parameters<typeof api.evaluateTeam>[0]) => api.evaluateTeam(input)
  );

  tool(
    'simulate_quest',
    'Simulate quest',
    'Monte Carlo simulation of a team against a quest. Returns win rate, a verdict, plain-language insights (what to fix), and per-unit survival.',
    {
      ...teamShape,
      quest: questSchema,
      miniBoss: z.enum(['None', 'Agile', 'Dire', 'Huge', 'Legendary']).optional(),
      defenseCap: z.number().optional().describe('Override the quest defense cap.'),
      runs: z.number().int().min(100).max(50000).optional().describe('Default 10000.'),
      seed: z.number().int().optional()
    },
    (input: Parameters<typeof api.simulateQuest>[0]) => api.simulateQuest(input)
  );

  tool(
    'scan_difficulties',
    'Scan difficulties',
    'Win rate of a team on every difficulty of one zone. Answers "what is the hardest difficulty this team can farm?".',
    {
      ...teamShape,
      zone: z.string(),
      type: z.enum(['Normal', 'Boss']).optional(),
      miniBoss: z.enum(['None', 'Agile', 'Dire', 'Huge', 'Legendary']).optional(),
      runs: z.number().int().min(100).max(20000).optional().describe('Per difficulty. Default 2000.')
    },
    (input: Parameters<typeof api.scanDifficulties>[0]) => api.scanDifficulties(input)
  );

  await server.connect(new StdioServerTransport());
  process.stderr.write(`TitanForge MCP ready · ${loaded.data.metadata.officialSpreadsheetVersion} · ${loaded.source.label}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
