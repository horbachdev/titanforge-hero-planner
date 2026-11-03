import { simulateTeam, type TeamSimulationRequest } from '../../shared/team';
import type { GameData } from '../../shared/types';

type Message = { type: 'init'; data: GameData } | { type: 'run'; id: number; request: TeamSimulationRequest };

let data: GameData | null = null;

self.onmessage = (event: MessageEvent<Message>) => {
  const message = event.data;
  if (message.type === 'init') {
    data = message.data;
    return;
  }
  try {
    if (!data) {
      throw new Error('Simulation worker has no game data.');
    }
    self.postMessage({ type: 'result', id: message.id, result: simulateTeam(message.request, data) });
  } catch (error) {
    self.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
  }
};
