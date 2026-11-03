import { simulateTeam, type TeamSimulationRequest } from '../../shared/team';
import type { GameData } from '../../shared/types';
import { scanStep, type ScanRequest } from './scan';

type Message =
  | { type: 'init'; data: GameData }
  | { type: 'run'; id: number; request: TeamSimulationRequest }
  | { type: 'scan'; id: number; request: ScanRequest }
  | { type: 'cancel'; id: number };

let data: GameData | null = null;
const cancelled = new Set<number>();

self.onmessage = (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'init') {
    data = message.data;
    return;
  }
  if (message.type === 'cancel') {
    cancelled.add(message.id);
    return;
  }
  if (!data) {
    self.postMessage({ type: 'error', id: message.id, message: 'Simulation worker has no game data.' });
    return;
  }
  if (message.type === 'run') {
    try {
      self.postMessage({ type: 'result', id: message.id, result: simulateTeam(message.request, data) });
    } catch (error) {
      self.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  void runScan(message.id, message.request, data);
};

/** Scans in small chunks and yields between them so "run" and "cancel" messages get through. */
async function runScan(id: number, request: ScanRequest, gameData: GameData): Promise<void> {
  for (let offset = 0; offset < request.questIds.length; offset += 12) {
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    const chunk = request.questIds.slice(offset, offset + 12);
    self.postMessage({ type: 'scan-progress', id, results: scanStep(request, chunk, gameData) });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  self.postMessage({ type: 'scan-done', id });
}
