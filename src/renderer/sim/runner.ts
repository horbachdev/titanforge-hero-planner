import { useEffect, useRef, useState } from 'react';
import { simulateTeam, type TeamSimulationRequest, type TeamSimulationResult } from '../../shared/team';
import type { GameData } from '../../shared/types';

/**
 * Runs simulations off the main thread so typing and clicking never freeze
 * the UI (v0.1 re-ran 10,000 fights synchronously on every render).
 * Falls back to deferred in-thread execution where workers are unavailable
 * (tests, very old webviews).
 */
export interface SimulationRunner {
  run(request: TeamSimulationRequest): Promise<TeamSimulationResult>;
  dispose(): void;
}

export function createSimulationRunner(data: GameData): SimulationRunner {
  if (typeof Worker === 'undefined') {
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
      dispose: () => undefined
    };
  }

  const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (result: TeamSimulationResult) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  worker.postMessage({ type: 'init', data });
  worker.onmessage = (event: MessageEvent<{ type: 'result' | 'error'; id: number; result?: TeamSimulationResult; message?: string }>) => {
    const entry = pending.get(event.data.id);
    pending.delete(event.data.id);
    if (event.data.type === 'result' && event.data.result) {
      entry?.resolve(event.data.result);
    } else {
      entry?.reject(new Error(event.data.message ?? 'Simulation failed.'));
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
    dispose() {
      worker.terminate();
      pending.clear();
    }
  };
}

export function useSimulationRunner(data: GameData): SimulationRunner {
  const runnerRef = useRef<SimulationRunner | null>(null);
  if (!runnerRef.current) {
    runnerRef.current = createSimulationRunner(data);
  }
  useEffect(() => {
    const runner = runnerRef.current;
    return () => {
      runner?.dispose();
      runnerRef.current = null;
    };
  }, []);
  return runnerRef.current;
}

export interface SimulationState<T> {
  result: T | null;
  running: boolean;
  error: string | null;
}

/**
 * Debounced, latest-wins async computation. Results of outdated requests are
 * dropped; the previous result stays visible (dimmed) while a new one runs.
 */
export function useLatestAsync<T>(key: string | null, compute: () => Promise<T>, delay = 200): SimulationState<T> {
  const [state, setState] = useState<SimulationState<T>>({ result: null, running: false, error: null });
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
