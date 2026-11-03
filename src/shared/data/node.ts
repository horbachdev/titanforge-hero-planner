import { bundledDataSource } from './bundled';
import { fileDataSource } from './file';
import { fallbackDataSource, remoteJsonDataSource, type GameDataSource } from './source';

/**
 * Data source selection for Node entry points (CLI, MCP server):
 *   TITANFORGE_DATA      path to a game-data.json file
 *   TITANFORGE_DATA_URL  URL of a game-data.json (or an API, see source.ts)
 * Always falls back to the bundled data so a bad URL never breaks the tool.
 */
export function createNodeDataSource(env: NodeJS.ProcessEnv = process.env): GameDataSource {
  const sources: GameDataSource[] = [];
  if (env.TITANFORGE_DATA) {
    sources.push(fileDataSource(env.TITANFORGE_DATA));
  }
  if (env.TITANFORGE_DATA_URL) {
    sources.push(remoteJsonDataSource(env.TITANFORGE_DATA_URL));
  }
  sources.push(bundledDataSource());
  return sources.length === 1 ? sources[0] : fallbackDataSource(...sources);
}
