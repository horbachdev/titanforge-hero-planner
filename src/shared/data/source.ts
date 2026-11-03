import type { GameData } from '../types';
import { GameDataValidationError, validateGameData, type DataValidationReport } from './validate';

/**
 * The data source boundary.
 *
 * Everything above this line (stat engine, simulator, UI, LLM API) only ever
 * sees a validated `GameData` object. Where it came from is the source's
 * business: the bundled JSON, a JSON file hosted somewhere, a local file, or —
 * once one exists — an official API. Connecting a new backend means writing
 * one object that implements `GameDataSource` and maps the payload to
 * `GameData`. Nothing else has to change.
 */

export type GameDataSourceKind = 'bundled' | 'remote' | 'file' | 'api' | 'memory';

export interface GameDataSourceInfo {
  /** Stable identifier, e.g. "bundled" or "remote:https://…". */
  id: string;
  /** Human readable label shown in the UI ("Built-in data", "Online data"). */
  label: string;
  kind: GameDataSourceKind;
  /** URL or path, when it makes sense to show one. */
  location?: string;
}

export interface GameDataSource {
  readonly info: GameDataSourceInfo;
  /** Returns raw data. Validation happens in `loadGameData`. */
  load(signal?: AbortSignal): Promise<unknown>;
}

export interface LoadedGameData {
  data: GameData;
  source: GameDataSourceInfo;
  loadedAt: string;
  validation: DataValidationReport;
  /** Sources that were tried and failed before `source` succeeded. */
  failures: Array<{ source: GameDataSourceInfo; error: string }>;
}

/** Loads and validates data from a source. Throws if the data is unusable. */
export async function loadGameData(source: GameDataSource, signal?: AbortSignal): Promise<LoadedGameData> {
  const candidates = source instanceof FallbackDataSource ? source.sources : [source];
  const failures: LoadedGameData['failures'] = [];

  for (const candidate of candidates) {
    try {
      const raw = await candidate.load(signal);
      const validation = validateGameData(raw);
      if (!validation.ok) {
        throw new GameDataValidationError(validation, candidate.info.label);
      }
      return {
        data: raw as GameData,
        source: candidate.info,
        loadedAt: new Date().toISOString(),
        validation,
        failures
      };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      failures.push({ source: candidate.info, error: error instanceof Error ? error.message : String(error) });
    }
  }

  throw new Error(
    `No game data source could be loaded: ${failures.map((failure) => `${failure.source.label}: ${failure.error}`).join(' | ')}`
  );
}

/** Wraps an in-memory object. Handy for tests and for already-fetched data. */
export function memoryDataSource(data: GameData | (() => Promise<unknown>), info?: Partial<GameDataSourceInfo>): GameDataSource {
  return {
    info: { id: 'memory', label: 'In-memory data', kind: 'memory', ...info },
    load: async () => (typeof data === 'function' ? data() : data)
  };
}

export interface RemoteJsonOptions {
  label?: string;
  /** Injected for tests and non-browser runtimes. */
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  /** Maps a foreign payload (e.g. a future official API) into `GameData`. */
  transform?: (payload: unknown) => unknown;
  kind?: Extract<GameDataSourceKind, 'remote' | 'api'>;
}

/**
 * Fetches game data over HTTP. With `transform`, this is also the adapter for
 * a real API: fetch its payload, map it to `GameData`, done.
 */
export function remoteJsonDataSource(url: string, options: RemoteJsonOptions = {}): GameDataSource {
  const kind = options.kind ?? 'remote';
  return {
    info: { id: `${kind}:${url}`, label: options.label ?? 'Online data', kind, location: url },
    async load(signal) {
      const fetchImpl = options.fetchImpl ?? globalThis.fetch;
      if (!fetchImpl) {
        throw new Error('fetch is not available in this runtime.');
      }
      const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json', ...options.headers } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      const payload = await response.json();
      return options.transform ? options.transform(payload) : payload;
    }
  };
}

/** Tries each source in order and uses the first one that yields valid data. */
export class FallbackDataSource implements GameDataSource {
  readonly sources: GameDataSource[];
  readonly info: GameDataSourceInfo;

  constructor(sources: GameDataSource[]) {
    if (sources.length === 0) {
      throw new Error('FallbackDataSource needs at least one source.');
    }
    this.sources = sources;
    this.info = {
      id: `fallback:${sources.map((source) => source.info.id).join(',')}`,
      label: sources.map((source) => source.info.label).join(' → '),
      kind: sources[0].info.kind
    };
  }

  async load(signal?: AbortSignal): Promise<unknown> {
    return (await loadGameData(this, signal)).data;
  }
}

export function fallbackDataSource(...sources: GameDataSource[]): FallbackDataSource {
  return new FallbackDataSource(sources);
}
