import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GameDataSource } from './source';

/** Node-only source: reads a game-data JSON file from disk (CLI, MCP server). */
export function fileDataSource(path: string): GameDataSource {
  const absolute = resolve(path);
  return {
    info: { id: `file:${absolute}`, label: 'Local data file', kind: 'file', location: absolute },
    load: async () => JSON.parse(await readFile(absolute, 'utf8'))
  };
}
