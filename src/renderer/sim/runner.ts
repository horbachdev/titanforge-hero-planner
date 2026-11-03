import { useEffect, useRef, useState } from 'react';
import { simulateTeam, type TeamSimulationRequest, type TeamSimulationResult } from '../../shared/team';
import type { GameData } from '../../shared/types';
import { scanStep, type ScanCell, type ScanRequest } from './scan';

/**
 * Runs simulations off the main thread so typing and clicking never freeze
 * the UI. Falls back to deferred in-thread execution where workers are
 * unavailable (tests, very old webviews).
 */
export interface SimulationRunner {
  run(request: TeamSimulationRequest): Promise<TeamSimulationResult>;
  /** Streams quick estimates for many quests. Returns a cancel function. */
  scan(request: ScanRequest, onProgress: (cells: Record<string, ScanCell>) => void, onDone?: () => void): () => void;
  dispose(): void;
}

export function createSimulationRunner(data: GameData): SimulationRunner {
  if (typeof Worker === 'undefined') {
    return createInlineRunner(data);
  }

  const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (result: TeamSimulationResult) => void; reject: (error: Error) => void }>();
  const scans = new Map<number, { onProgress: (cells: Record<string, ScanCell>) => void; onDone?: () => void }>();
  let nextId = 1;
  worker.postMessage({ type: 'init', data });
  worker.onmessage = (
    event: MessageEvent<{
      type: 'result' | 'error' | 'scan-progress' | 'scan-done';
      id: number;
      result?: TeamSimulationResult;
      results?: Record<string, ScanCell>;
      message?: string;
    }>
  ) => {
    const message = event.data;
    if (message.type === 'scan-progress') {
      scans.get(message.id)?.onProgress(message.results ?? {});
      return;
    }
    if (message.type === 'scan-done') {
      scans.get(message.id)?.onDone?.();
      scans.delete(message.id);
      return;
    }
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.type === 'result' && message.result) {
      entry?.resolve(message.result);
    } else {
      entry?.reject(new Error(message.message ?? 'Simulation failed.'));
    }
  };
  worker.onerror = (event) => {
    for (const entry of pending.values()) {
      entry.reject(new Error(event.message || 'Simulation worker crashed.'));
    }
    pending.clear();
  };

  return {
    run(request) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'run', id, request });
      });
    },
    scan(request, onProgress, onDone) {
      const id = nextId++;
      scans.set(id, { onProgress, onDone });
      worker.postMessage({ type: 'scan', id, request });
      return () => {
        scans.delete(id);
        worker.postMessage({ type: 'cancel', id });
      };
    },
    dispose() {
      worker.terminate();
      pending.clear();
      scans.clear();
    }
  };
}

function createInlineRunner(data: GameData): SimulationRunner {
  return {
    run: (request) =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          try {
            resolve(simulateTeam(request, data));
          } catch (error) {
            reject(error);
          }
        }, 0)
      ),
    scan(request, onProgress, onDone) {
      let cancelled = false;
      let offset = 0;
      const step = () => {
        if (cancelled) {
          return;
        }
        const chunk = request.questIds.slice(offset, offset + 12);
        offset += 12;
        onProgress(scanStep(request, chunk, data));
        if (offset < request.questIds.length) {
          setTimeout(step, 0);
        } else {
          onDone?.();
        }
      };
      setTimeout(step, 0);
      return () => {
        cancelled = true;
      };
    },
    dispose: () => undefined
  };
}

/** One runner per mounted consumer; safe under React StrictMode double effects. */
export function useSimulationRunner(data: GameData): SimulationRunner | null {
  const [runner, setRunner] = useState<SimulationRunner | null>(null);
  useEffect(() => {
    const created = createSimulationRunner(data);
    setRunner(created);
    return () => created.dispose();
  }, [data]);
  return runner;
}

export interface AsyncState<T> {
  result: T | null;
  running: boolean;
  error: string | null;
}

/**
 * Debounced, latest-wins async computation. Results of outdated requests are
 * dropped; the previous result stays visible (dimmed) while a new one runs.
 */
export function useLatestAsync<T>(key: string | null, compute: () => Promise<T>, delay = 150): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ result: null, running: false, error: null });
  const generation = useRef(0);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    const current = ++generation.current;
    if (key === null) {
      setState({ result: null, running: false, error: null });
      return;
    }
    setState((previous) => ({ ...previous, running: true, error: null }));
    const timer = setTimeout(() => {
      computeRef
        .current()
        .then((result) => {
          if (current === generation.current) {
            setState({ result, running: false, error: null });
          }
        })
        .catch((error: unknown) => {
          if (current === generation.current) {
            setState((previous) => ({ ...previous, running: false, error: error instanceof Error ? error.message : String(error) }));
          }
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [key, delay]);

  return state;
}

/** Streams quick win-rate estimates for a party across many quests. */
export function useQuestScan(runner: SimulationRunner | null, key: string | null, request: ScanRequest | null) {
  const [cells, setCells] = useState<Record<string, ScanCell>>({});
  const [done, setDone] = useState(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  useEffect(() => {
    setCells({});
    setDone(false);
    if (!runner || !key || !requestRef.current) {
      return;
    }
    let cancel: (() => void) | null = null;
    const timer = setTimeout(() => {
      cancel = runner.scan(
        requestRef.current!,
        (partial) => setCells((current) => ({ ...current, ...partial })),
        () => setDone(true)
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      cancel?.();
    };
  }, [runner, key]);

  return { cells, done };
}
