import { simulateTeam, verdictForWinRate, type TeamSimulationRequest, type VerdictLevel } from '../../shared/team';
import type { GameData } from '../../shared/types';

/** Quick win-rate estimate of one party against many quests (the quest board heatmap). */
export interface ScanRequest extends Omit<TeamSimulationRequest, 'questId' | 'runs' | 'defenseCap'> {
  questIds: string[];
  runs: number;
}

export interface ScanCell {
  winRate: number;
  level: VerdictLevel;
}

export function scanStep(request: ScanRequest, questIds: string[], data: GameData): Record<string, ScanCell> {
  const results: Record<string, ScanCell> = {};
  for (const questId of questIds) {
    try {
      const result = simulateTeam({ ...request, questId, runs: request.runs, defenseCap: null }, data);
      results[questId] = {
        winRate: result.simulation.successRate,
        level: verdictForWinRate(result.simulation.successRate, result.simulation.occupiedCombatants)
      };
    } catch {
      // Skip quests the simulator cannot handle; the cell stays empty.
    }
  }
  return results;
}
