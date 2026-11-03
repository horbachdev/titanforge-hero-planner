#!/usr/bin/env node
/**
 * TitanForge CLI — the planner API for shells and scripts.
 *
 *   pnpm titanforge info
 *   pnpm titanforge search '{"kind":"item","query":"kiku"}'
 *   echo '{"heroes":[{"heroClass":"Soldier"}],"quest":{"zone":"Howling Woods","difficulty":"Hard"}}' | pnpm -s titanforge simulate
 *
 * Output is always JSON on stdout. Errors are JSON on stdout with exit code 1,
 * so an agent can parse both outcomes the same way.
 */
import { createPlannerApi, PlannerError, type PlannerApi } from '../shared/api/planner';
import { createNodeDataSource } from '../shared/data/node';
import { loadGameData } from '../shared/data/source';

const COMMANDS: Record<string, { run: (api: PlannerApi, input: any) => unknown; help: string }> = {
  info: { run: (api) => api.getDataInfo(), help: 'Data version, counts, conventions' },
  search: { run: (api, input) => api.search(input), help: '{"kind":"item|hero|skill|champion|enchantment|quest","query":"…"}' },
  details: { run: (api, input) => api.getDetails(input), help: '{"kind":"hero","id":"Soldier"}' },
  'hero-options': { run: (api, input) => api.getHeroOptions(input), help: '{"heroClass":"Soldier","level":40}' },
  hero: { run: (api, input) => api.evaluateHero(input), help: '{"heroClass":"Soldier","gear":[{"item":"…"}]}' },
  champion: { run: (api, input) => api.evaluateChampion(input), help: '{"champion":"Argon"}' },
  team: { run: (api, input) => api.evaluateTeam(input), help: '{"heroes":[…],"champion":{…}}' },
  simulate: { run: (api, input) => api.simulateQuest(input), help: '{"heroes":[…],"quest":{"zone":"…","difficulty":"Hard"}}' },
  scan: { run: (api, input) => api.scanDifficulties(input), help: '{"heroes":[…],"zone":"Howling Woods"}' }
};

async function main(): Promise<void> {
  const [command, inlineJson] = process.argv.slice(2);
  if (!command || !COMMANDS[command]) {
    process.stdout.write(
      `Usage: titanforge <command> [json]   (json can also come from stdin)\n\n${Object.entries(COMMANDS)
        .map(([name, entry]) => `  ${name.padEnd(13)} ${entry.help}`)
        .join('\n')}\n`
    );
    process.exitCode = command ? 1 : 0;
    return;
  }

  const needsInput = command !== 'info';
  const raw = inlineJson ?? (needsInput && !process.stdin.isTTY ? await readStdin() : '');
  let input: unknown = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    print({ error: { code: 'invalid_json', message: (error as Error).message, suggestions: [] } });
    process.exitCode = 1;
    return;
  }

  const api = createPlannerApi(await loadGameData(createNodeDataSource()));
  try {
    print(COMMANDS[command].run(api, input));
  } catch (error) {
    print(error instanceof PlannerError ? error.toJSON() : { error: { code: 'internal', message: String(error), suggestions: [] } });
    process.exitCode = 1;
  }
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Reads piped JSON. Gives up after a short idle period so an agent whose
 * shell keeps stdin open (but never writes to it) does not hang forever.
 */
function readStdin(idleMs = 1500): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let timer = setTimeout(finish, idleMs);
    function finish(): void {
      clearTimeout(timer);
      process.stdin.pause();
      process.stdin.removeAllListeners();
      resolve(Buffer.concat(chunks).toString('utf8'));
    }
    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      clearTimeout(timer);
      timer = setTimeout(finish, idleMs);
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

void main();
