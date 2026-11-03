import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, Swords, Users, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { formatZone, questZones, type QuestZone } from '../../shared/catalog';
import type { RessMiniBossModifier } from '../../shared/combat-engine';
import { estimateQuestDefenseCap } from '../../shared/combat-engine';
import {
  ELEMENT_LABELS,
  MINI_BOSS_MODIFIERS,
  type InsightSeverity,
  type SimulationInsight,
  type TeamSimulationRequest,
  type TeamSimulationResult
} from '../../shared/team';
import type { BuildConfig, QuestData } from '../../shared/types';
import { Combobox } from '../components/Combobox';
import { Avatar, buildHero, fmt, fmtPercent } from '../components/game';
import { Card, EmptyState, NumberField, Segmented } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useLatestAsync, useSimulationRunner } from '../sim/runner';
import { useStore } from '../state/store';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Extreme'];
const RUN_PRESETS = [1000, 10000, 50000];
const LADDER_RUNS = 1000;

export function SimulateView(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const runner = useSimulationRunner(data);
  const zones = useMemo(() => questZones(data), [data]);
  const sim = store.prefs.sim;

  const team = store.teams.find((entry) => entry.id === store.prefs.teamId) ?? store.teams[0];
  const heroBuilds = useMemo(
    () => (team?.heroBuildIds ?? []).map((id) => store.heroes.find((build) => build.id === id) ?? null),
    [team, store.heroes]
  );
  const championBuild = store.champions.find((build) => build.id === team?.championBuildId) ?? null;
  const heroCount = heroBuilds.filter(Boolean).length;

  const quest = repo.quest(sim.questId) ?? zones[0]?.quests[0];
  const zone = zones.find((entry) => entry.quests.some((candidate) => candidate.id === quest?.id)) ?? zones[0];
  const questTypes = [...new Set(zone?.quests.map((entry) => entry.type) ?? [])];
  const variants = zone?.quests.filter((entry) => entry.type === quest?.type) ?? [];
  const defaultCap = quest ? quest.defenseCap || estimateQuestDefenseCap(quest) : 0;
  const capOverride = quest ? sim.defenseCaps[quest.id] : undefined;

  const setSim = (patch: Partial<typeof sim>) => store.setPrefs((current) => ({ sim: { ...current.sim, ...patch } }));

  function pickQuest(next: QuestData | undefined): void {
    if (next) {
      setSim({ questId: next.id, zoneKey: next.zone.toLowerCase() });
    }
  }

  function pickZone(zoneKey: string): void {
    const nextZone = zones.find((entry) => entry.key === zoneKey);
    if (!nextZone) {
      return;
    }
    // Keep type and difficulty when the new zone has them.
    const match =
      nextZone.quests.find((entry) => entry.type === quest?.type && entry.difficulty === quest?.difficulty) ??
      nextZone.quests.find((entry) => entry.difficulty === quest?.difficulty) ??
      nextZone.quests[0];
    pickQuest(match);
  }

  const request: TeamSimulationRequest | null =
    quest && heroCount > 0
      ? {
          heroes: heroBuilds,
          champion: championBuild,
          questId: quest.id,
          miniBoss: sim.miniBoss,
          defenseCap: capOverride ?? null,
          runs: sim.runs
        }
      : null;
  const requestKey = request ? JSON.stringify(request) : null;
  const main = useLatestAsync<TeamSimulationResult>(requestKey, () => runner.run(request!));

  // Difficulty ladder: the same team on every difficulty of this zone.
  const ladderKey =
    request && variants.length > 1 ? JSON.stringify({ ...request, questId: variants.map((entry) => entry.id), runs: LADDER_RUNS }) : null;
  const ladder = useLatestAsync<TeamSimulationResult[]>(
    ladderKey,
    () => Promise.all(variants.map((variant) => runner.run({ ...request!, questId: variant.id, defenseCap: null, runs: LADDER_RUNS }))),
    500
  );

  if (store.heroes.length === 0) {
    return (
      <div className="view">
        <EmptyState
          icon={<Swords size={32} />}
          title="Nothing to simulate yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => store.setTab('heroes')}>
              Create a hero
            </button>
          }
        >
          <p>The simulator fights a quest thousands of times with your team and tells you how often you win — and what to improve.</p>
          <ol className="steps">
            <li className="is-current">Create heroes</li>
            <li>Put them in a team (with a champion)</li>
            <li>Simulate a quest and see what to improve</li>
          </ol>
        </EmptyState>
      </div>
    );
  }

  const zoneOptions = zones.map((entry) => ({
    value: entry.key,
    label: entry.label,
    group: entry.group,
    detail: zoneDetail(entry)
  }));

  return (
    <div className="view sim-layout">
      <aside className="sim-controls" aria-label="Simulation setup">
        <Card title="Team">
          <Combobox
            label="Team"
            hideLabel
            value={team?.id ?? ''}
            options={store.teams.map((entry) => ({
              value: entry.id,
              label: entry.name,
              detail: `${entry.heroBuildIds.filter(Boolean).length} heroes${entry.championBuildId ? ' + champion' : ''}`
            }))}
            onChange={(teamId) => store.setPrefs({ teamId })}
          />
          <TeamStrip
            heroBuilds={heroBuilds}
            championName={championBuild?.name}
            limit={quest ? (quest.lcog ? 5 : Math.min(4, quest.partySize || 4)) : 4}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.setTab('teams')}>
            <Users size={15} /> Edit team
          </button>
        </Card>

        <Card title="Quest">
          <Combobox label="Zone" value={zone?.key ?? ''} options={zoneOptions} onChange={pickZone} placeholder="Search zone or boss…" />
          {questTypes.length > 1 && (
            <Segmented
              label="Fight"
              value={quest?.type ?? 'Normal'}
              options={questTypes.map((type) => ({ value: type, label: type === 'Boss' ? 'Boss fight' : 'Regular' }))}
              onChange={(type) =>
                pickQuest(
                  zone?.quests.find((entry) => entry.type === type && entry.difficulty === quest?.difficulty) ??
                    zone?.quests.find((entry) => entry.type === type)
                )
              }
            />
          )}
          <Segmented
            label="Difficulty"
            value={quest?.difficulty ?? 'Easy'}
            options={DIFFICULTIES.map((difficulty) => ({
              value: difficulty,
              label: difficulty,
              disabled: !variants.some((entry) => entry.difficulty === difficulty)
            }))}
            onChange={(difficulty) => pickQuest(variants.find((entry) => entry.difficulty === difficulty))}
          />
          <Segmented<RessMiniBossModifier>
            label="Mini-boss"
            size="sm"
            value={sim.miniBoss}
            options={MINI_BOSS_MODIFIERS.map((modifier) => ({ value: modifier, label: modifier }))}
            onChange={(miniBoss) => setSim({ miniBoss })}
          />
          {quest && <QuestFacts quest={quest} defenseCap={capOverride ?? defaultCap} />}
        </Card>

        <details className="card advanced">
          <summary>Advanced</summary>
          <Segmented
            label="Simulated fights"
            size="sm"
            value={sim.runs}
            options={RUN_PRESETS.map((runs) => ({ value: runs, label: runs >= 1000 ? `${runs / 1000}K` : String(runs) }))}
            onChange={(runs) => setSim({ runs })}
          />
          <p className="field-hint">More fights = steadier numbers, a bit slower.</p>
          {quest && (
            <>
              <NumberField
                label="Defense cap"
                value={capOverride ?? defaultCap}
                min={0}
                max={10_000_000}
                step={100}
                onChange={(value) => setSim({ defenseCaps: { ...sim.defenseCaps, [quest.id]: value } })}
                hint={quest.defenseCap > 0 ? `Imported value: ${fmt(quest.defenseCap)}` : 'Estimated — no exact value imported'}
              />
              {capOverride !== undefined && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const { [quest.id]: _removed, ...rest } = sim.defenseCaps;
                    setSim({ defenseCaps: rest });
                  }}
                >
                  Reset to {fmt(defaultCap)}
                </button>
              )}
            </>
          )}
        </details>
      </aside>

      <section className="sim-results" aria-live="polite" aria-busy={main.running}>
        {heroCount === 0 ? (
          <EmptyState
            icon={<Users size={32} />}
            title={`“${team?.name}” has no heroes`}
            action={
              <button type="button" className="btn btn-primary" onClick={() => store.setTab('teams')}>
                Add heroes to the team
              </button>
            }
          />
        ) : main.error ? (
          <div className="callout callout-danger" role="alert">
            <strong>Simulation failed</strong>
            <p>{main.error}</p>
          </div>
        ) : main.result ? (
          <Results
            result={main.result}
            running={main.running}
            ladder={ladder.result}
            ladderRunning={ladder.running}
            currentQuestId={quest?.id ?? ''}
            onPick={pickQuest}
          />
        ) : (
          <div className="sim-loading">
            <Loader2 className="spin" size={24} /> Simulating {fmt(sim.runs)} fights…
          </div>
        )}
      </section>
    </div>
  );
}

function TeamStrip({
  heroBuilds,
  championName,
  limit
}: {
  heroBuilds: Array<BuildConfig | null>;
  championName?: string;
  limit: number;
}): JSX.Element {
  const { repo } = useGame();
  return (
    <ul className="team-strip">
      {championName && (
        <li title="Champion">
          <Avatar name={championName} role="champion" size="sm" />
          <span>{championName}</span>
        </li>
      )}
      {heroBuilds.map((build, index) => {
        if (!build) {
          return null;
        }
        const hero = buildHero(repo, build);
        const benched = index >= limit;
        return (
          <li key={build.id} className={benched ? 'is-benched' : ''} title={benched ? 'Does not fit this quest’s party size' : undefined}>
            <Avatar name={hero?.name ?? '?'} role={hero?.role} size="sm" />
            <span>{build.name}</span>
            {benched && <small>bench</small>}
          </li>
        );
      })}
    </ul>
  );
}

function QuestFacts({ quest, defenseCap }: { quest: QuestData; defenseCap: number }): JSX.Element {
  const barrierTypes = quest.barrierOptions.filter((entry) => entry && entry !== 'None');
  return (
    <dl className="facts">
      <div>
        <dt>Enemy HP</dt>
        <dd>{fmt(quest.enemyHealth)}</dd>
      </div>
      <div>
        <dt>Enemy attack</dt>
        <dd>{fmt(quest.enemyDamage)}</dd>
      </div>
      <div>
        <dt>Defense cap</dt>
        <dd>{fmt(defenseCap)}</dd>
      </div>
      <div>
        <dt>Party size</dt>
        <dd>{quest.lcog ? 5 : Math.min(4, quest.partySize || 4)}</dd>
      </div>
      {quest.aoeDamage > 0 && (
        <div>
          <dt>Area attack</dt>
          <dd>
            {fmt(quest.aoeDamage)} · {fmtPercent(quest.aoeChance, 0)}
          </dd>
        </div>
      )}
      {quest.barrierHealth > 0 && (
        <div>
          <dt>Barrier</dt>
          <dd>
            {fmt(quest.barrierHealth)} {barrierTypes.join('/')}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Results({
  result,
  running,
  ladder,
  ladderRunning,
  currentQuestId,
  onPick
}: {
  result: TeamSimulationResult;
  running: boolean;
  ladder: TeamSimulationResult[] | null;
  ladderRunning: boolean;
  currentQuestId: string;
  onPick: (quest: QuestData) => void;
}): JSX.Element {
  const { verdict, insights } = result.analysis;
  const sim = result.simulation;

  return (
    <div className={`results ${running ? 'is-stale' : ''}`}>
      <section className={`verdict verdict-${verdict.level}`}>
        <div className="verdict-rate">
          <span className="verdict-number">{fmtPercent(verdict.winRate, verdict.winRate % 1 === 0 ? 0 : 1)}</span>
          <span className="verdict-caption">win rate</span>
        </div>
        <div className="verdict-text">
          <span className="verdict-label">{verdict.label}</span>
          <h2>{verdict.headline}</h2>
          <p className="muted">
            {formatZone(result.quest.zone)} · {result.quest.type} · {result.quest.difficulty}
            {sim.enemy.miniBoss !== 'None' && ` · ${sim.enemy.miniBoss} mini-boss`} · {fmt(sim.simulations)} fights
            {sim.averageRounds > 0 &&
              ` · ~${Math.max(1, Math.round(sim.averageRounds))} round${Math.round(sim.averageRounds) > 1 ? 's' : ''} per win`}
          </p>
        </div>
        {running && <Loader2 className="spin verdict-spinner" size={20} aria-label="Updating" />}
      </section>

      {ladder && ladder.length > 1 && (
        <section className={`ladder ${ladderRunning ? 'is-stale' : ''}`} aria-label="Win rate by difficulty">
          {ladder.map((entry) => (
            <button
              key={entry.quest.id}
              type="button"
              className={`ladder-step verdict-${entry.analysis.verdict.level} ${entry.quest.id === currentQuestId ? 'is-current' : ''}`}
              onClick={() => onPick(entry.quest)}
              title={`${entry.quest.difficulty}: ${fmtPercent(entry.simulation.successRate)} (${fmt(entry.simulation.simulations)} quick fights)`}
            >
              <span>{entry.quest.difficulty}</span>
              <strong>{fmtPercent(entry.simulation.successRate, 0)}</strong>
            </button>
          ))}
          <span className="ladder-hint">Quick check on every difficulty · click to switch</span>
        </section>
      )}

      {insights.length > 0 && (
        <section className="insights" aria-label="What to improve">
          <h3>{verdict.level === 'reliable' ? 'Notes' : 'What to improve'}</h3>
          <ul>
            {insights.map((insight) => (
              <InsightRow key={`${insight.code}-${insight.unitId ?? ''}`} insight={insight} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Units">
        <h3>Your units</h3>
        <div className="unit-grid">
          {sim.rows.map((row) => (
            <article key={row.combatant.id} className="unit-card">
              <header>
                <Avatar
                  name={row.combatant.className ?? row.combatant.name}
                  role={row.combatant.kind === 'champion' ? 'champion' : row.combatant.role}
                  size="sm"
                />
                <span>
                  <strong>{row.combatant.name}</strong>
                  <small>{row.combatant.className}</small>
                </span>
              </header>
              <div className="survival">
                <div
                  className="survival-bar"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(row.survivalRate)}
                  aria-label={`${row.combatant.name} survives`}
                >
                  <span style={{ width: `${row.survivalRate}%` }} className={survivalTone(row.survivalRate)} />
                </div>
                <span className="survival-text">
                  Survives <b>{fmtPercent(row.survivalRate)}</b>
                </span>
              </div>
              <dl className="unit-facts">
                <div>
                  <dt>Targeted</dt>
                  <dd>{fmtPercent(row.targetPercent)}</dd>
                </div>
                <div>
                  <dt>Hit taken</dt>
                  <dd>
                    {fmt(row.damagePerHit)} <small>/ {fmt(row.criticalDamagePerHit)} crit</small>
                  </dd>
                </div>
                <div>
                  <dt>Avg damage</dt>
                  <dd>{fmt(row.averageDamageDealt)}</dd>
                </div>
                <div>
                  <dt>HP left</dt>
                  <dd>
                    {fmt(row.averageHpRemaining)} <small>/ {fmt(row.stats.hp)}</small>
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <details className="card details-table">
        <summary>All numbers</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Unit</th>
                <th scope="col">HP</th>
                <th scope="col">ATK</th>
                <th scope="col">DEF</th>
                <th scope="col">EVA</th>
                <th scope="col">CRIT</th>
                <th scope="col">Threat</th>
                <th scope="col">Targeted</th>
                <th scope="col">Hit taken</th>
                <th scope="col">Crit taken</th>
                <th scope="col">Survival</th>
                <th scope="col">Avg HP left</th>
                <th scope="col">Avg dmg</th>
                <th scope="col">Max dmg</th>
              </tr>
            </thead>
            <tbody>
              {sim.rows.map((row) => (
                <tr key={row.combatant.id}>
                  <th scope="row">{row.combatant.name}</th>
                  <td>{fmt(row.stats.hp)}</td>
                  <td>{fmt(row.stats.attack)}</td>
                  <td>{fmt(row.stats.defense)}</td>
                  <td>{fmtPercent(row.stats.evasion)}</td>
                  <td>{fmtPercent(row.stats.critChance)}</td>
                  <td>{fmt(row.stats.threat)}</td>
                  <td>{fmtPercent(row.targetPercent)}</td>
                  <td>{fmt(row.damagePerHit)}</td>
                  <td>{fmt(row.criticalDamagePerHit)}</td>
                  <td>{fmtPercent(row.survivalRate)}</td>
                  <td>{fmt(row.averageHpRemaining)}</td>
                  <td>{fmt(row.averageDamageDealt)}</td>
                  <td>{fmt(row.maximumDamageDealt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="facts facts-inline">
          <div>
            <dt>Rounds (min / avg / max)</dt>
            <dd>
              {sim.minimumRounds} / {Math.round(sim.averageRounds * 10) / 10} / {sim.maximumRounds}
            </dd>
          </div>
          <div>
            <dt>Enemy crit / evasion</dt>
            <dd>
              {fmtPercent(sim.enemy.critChance)} / {fmtPercent(sim.enemy.evasion)}
            </dd>
          </div>
          {sim.barrier.required > 0 && (
            <div>
              <dt>Barrier ({sim.barrier.types.map((type) => ELEMENT_LABELS[type] ?? type).join('/')})</dt>
              <dd>
                {fmt(sim.barrier.available)} / {fmt(sim.barrier.required)} {sim.barrier.met ? '✓' : '✗'}
              </dd>
            </div>
          )}
          {sim.poloniaLootAverage > 0 && (
            <div>
              <dt>Polonia loot / run</dt>
              <dd>{Math.round(sim.poloniaLootAverage * 100) / 100}</dd>
            </div>
          )}
        </dl>
        <ul className="sim-notes">
          {sim.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>

      <p className="disclaimer">
        Based on a port of Ress’ community Hero &amp; Quest Simulator. Not modelled: rest time, break chance, Tamas randomness and loot side effects.
        Results are estimates, not guarantees.
      </p>
    </div>
  );
}

const SEVERITY_ICON: Record<InsightSeverity, JSX.Element> = {
  critical: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
  success: <CheckCircle2 size={18} />
};

function InsightRow({ insight }: { insight: SimulationInsight }): JSX.Element {
  return (
    <li className={`insight insight-${insight.severity}`}>
      <span className="insight-icon" aria-label={insight.severity}>
        {insight.code === 'barrier-short' ? <ShieldAlert size={18} /> : SEVERITY_ICON[insight.severity]}
      </span>
      <span>
        <strong>{insight.title}</strong>
        <span className="insight-detail">{insight.detail}</span>
      </span>
    </li>
  );
}

function survivalTone(rate: number): string {
  return rate >= 99.5 ? 'tone-good' : rate >= 80 ? 'tone-ok' : rate >= 40 ? 'tone-warn' : 'tone-bad';
}

function zoneDetail(zone: QuestZone): string {
  const sample = zone.quests[0];
  const parts = [
    zone.quests.some((entry) => entry.type === 'Boss') && zone.quests.some((entry) => entry.type === 'Normal') ? 'Regular + Boss' : sample.type,
    sample.lcog ? '5 heroes' : `${Math.min(4, sample.partySize || 4)} heroes`,
    zone.quests.some((entry) => entry.barrierHealth > 0) ? 'barrier' : ''
  ];
  return parts.filter(Boolean).join(' · ');
}
