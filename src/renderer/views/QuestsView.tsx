import { AlertTriangle, CheckCircle2, Crown, Info, Loader2, Plus, Search, ShieldAlert, Trash2, UserPlus, X, XCircle } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { formatZone, questZones, type QuestZone, type ZoneGroup } from '../../shared/catalog';
import { estimateQuestDefenseCap, type RessMiniBossModifier } from '../../shared/combat-engine';
import {
  ELEMENT_LABELS,
  MINI_BOSS_MODIFIERS,
  resolveTeam,
  TEAM_HERO_SLOTS,
  type InsightSeverity,
  type SimulationInsight,
  type TeamSimulationRequest,
  type TeamSimulationResult
} from '../../shared/team';
import type { BuildConfig, QuestData, RosterConfig } from '../../shared/types';
import { ChampionCrest, Crest, ElementGem, elementKey, Gauge, heatColor, HeroCrest } from '../components/art';
import { buildHero, ElementPoints, fmt, fmtPercent } from '../components/game';
import { ChampionChooser, ClassPicker, HeroChooser } from '../components/pickers';
import { NumberField, Segmented } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useLatestAsync, useQuestScan, useSimulationRunner } from '../sim/runner';
import type { ScanCell } from '../sim/scan';
import { useStore } from '../state/store';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Extreme'];
const GROUPS: Array<ZoneGroup | 'All'> = ['All', 'Zones', 'Lost City of Gold', 'Bosses', 'Towers'];
const SCAN_RUNS = 300;

export function QuestsView(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const runner = useSimulationRunner(data);
  const zones = useMemo(() => questZones(data), [data]);
  const sim = store.prefs.sim;
  const party = store.teams.find((entry) => entry.id === store.prefs.teamId) ?? store.teams[0];
  const heroBuilds = useMemo(() => party.heroBuildIds.map((id) => store.heroes.find((build) => build.id === id) ?? null), [party, store.heroes]);
  const championBuild = store.champions.find((build) => build.id === party.championBuildId) ?? null;
  const heroCount = heroBuilds.filter(Boolean).length;
  const quest = repo.quest(sim.questId);

  const setSim = (patch: Partial<typeof sim>) => store.setPrefs((current) => ({ sim: { ...current.sim, ...patch } }));

  // Quick estimates for every quest (heatmap).
  const allQuestIds = useMemo(() => zones.flatMap((zone) => zone.quests.map((entry) => entry.id)), [zones]);
  const scanRequest =
    heroCount > 0 ? { heroes: heroBuilds, champion: championBuild, miniBoss: sim.miniBoss, questIds: allQuestIds, runs: SCAN_RUNS } : null;
  const scanKey = scanRequest ? JSON.stringify({ h: heroBuilds, c: championBuild, m: sim.miniBoss }) : null;
  const scan = useQuestScan(runner, scanKey, scanRequest);

  // Full simulation for the selected quest.
  const capOverride = quest ? sim.defenseCaps[quest.id] : undefined;
  const request: TeamSimulationRequest | null =
    quest && heroCount > 0
      ? { heroes: heroBuilds, champion: championBuild, questId: quest.id, miniBoss: sim.miniBoss, defenseCap: capOverride ?? null, runs: sim.runs }
      : null;
  const detail = useLatestAsync<TeamSimulationResult>(runner && request ? JSON.stringify(request) : null, () => runner!.run(request!));

  if (store.heroes.length === 0) {
    return (
      <div className="page">
        <section className="welcome">
          <div className="welcome-art">
            <Crest role="fighter" classId="knight" size="xl" />
            <Crest role="champion" size="xl" />
            <Crest role="spellcaster" classId="mage" size="xl" />
          </div>
          <h2>Where can your party win?</h2>
          <p>
            The quest board fights every quest thousands of times with your heroes and colours each one by how often you win. Start by recruiting the
            heroes you have in game.
          </p>
          <div className="welcome-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => store.navigate({ page: 'barracks' })}>
              <UserPlus size={18} /> Recruit heroes
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => store.navigate({ page: 'ledger' })}>
              Import a backup or AI build
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page quests-page">
      <PartyDock party={party} heroBuilds={heroBuilds} result={detail.result} limit={quest ? partySize(quest) : TEAM_HERO_SLOTS} />

      <div className="quests-layout">
        <QuestBoard
          zones={zones}
          cells={scan.cells}
          scanning={Boolean(scanKey) && !scan.done}
          hasParty={heroCount > 0}
          selectedId={quest?.id ?? ''}
          onSelect={(entry) => setSim({ questId: entry.id })}
        />
        <section className="quest-detail" aria-live="polite" aria-busy={detail.running}>
          {!quest ? (
            <div className="detail-empty">
              <ScrollHint />
              <h2>Pick a quest</h2>
              <p className="muted">
                {heroCount > 0
                  ? 'Each cell shows how often your party wins. Click one for the full fight analysis and what to improve.'
                  : 'Add heroes to your party above — the board then shows where you can win.'}
              </p>
            </div>
          ) : (
            <QuestDetail
              quest={quest}
              result={detail.result}
              running={detail.running}
              error={detail.error}
              heroCount={heroCount}
              miniBoss={sim.miniBoss}
              runs={sim.runs}
              capOverride={capOverride}
              onMiniBoss={(miniBoss) => setSim({ miniBoss })}
              onRuns={(runs) => setSim({ runs })}
              onCap={(value) =>
                setSim({ defenseCaps: value === undefined ? omit(sim.defenseCaps, quest.id) : { ...sim.defenseCaps, [quest.id]: value } })
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Party dock
// ---------------------------------------------------------------------------

function PartyDock({
  party,
  heroBuilds,
  result,
  limit
}: {
  party: RosterConfig;
  heroBuilds: Array<BuildConfig | null>;
  result: TeamSimulationResult | null;
  limit: number;
}): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const [choosing, setChoosing] = useState<{ kind: 'hero'; slot: number } | { kind: 'champion' } | { kind: 'recruit'; slot: number } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const championBuild = store.champions.find((build) => build.id === party.championBuildId) ?? null;
  const team = useMemo(() => resolveTeam({ heroes: heroBuilds, champion: championBuild }, data), [heroBuilds, championBuild, data]);
  const update = (updater: (current: RosterConfig) => RosterConfig) => store.updateTeam(party.id, updater);
  const survival = new Map(result?.simulation.rows.map((row) => [row.combatant.id, row.survivalRate]) ?? []);

  function setSlot(slot: number, buildId: string | null): void {
    update((current) => {
      const ids = [...current.heroBuildIds];
      const existing = buildId ? ids.indexOf(buildId) : -1;
      if (existing !== -1) {
        ids[existing] = ids[slot];
      }
      ids[slot] = buildId;
      return { ...current, heroBuildIds: ids };
    });
  }

  function onDrop(event: DragEvent, slot: number): void {
    event.preventDefault();
    if (dragFrom === null || dragFrom === slot) {
      return;
    }
    update((current) => {
      const ids = [...current.heroBuildIds];
      [ids[dragFrom], ids[slot]] = [ids[slot], ids[dragFrom]];
      return { ...current, heroBuildIds: ids };
    });
    setDragFrom(null);
  }

  return (
    <section className="party-dock" aria-label="Party">
      <div className="party-tabs" role="tablist" aria-label="Parties">
        {store.teams.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === party.id}
            className={`party-tab ${entry.id === party.id ? 'is-active' : ''}`}
            onClick={() => store.setPrefs({ teamId: entry.id })}
          >
            {entry.name}
          </button>
        ))}
        <button type="button" className="party-tab party-tab-add" onClick={() => store.createTeam()} aria-label="New party">
          <Plus size={15} />
        </button>
      </div>

      <div className="party-body">
        <div className="party-meta">
          <input
            className="party-name"
            aria-label="Party name"
            value={party.name}
            onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
          />
          <div className="party-power">
            <span>Party power</span>
            <strong>{fmt(team.totals.power)}</strong>
          </div>
          <ElementPoints scores={team.elementScores} />
          {store.teams.length > 1 && (
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => store.deleteTeam(party.id)}>
              <Trash2 size={14} /> Delete party
            </button>
          )}
        </div>

        <ol className="sockets">
          <li>
            {championBuild && team.champion ? (
              <div className="socket is-champion is-filled">
                <button
                  type="button"
                  className="socket-main"
                  onClick={() => setChoosing({ kind: 'champion' })}
                  aria-label={`Champion ${championBuild.name}, change`}
                >
                  <ChampionCrest champion={team.champion.champion} size="md" />
                  <span className="socket-text">
                    <strong>{championBuild.name}</strong>
                    <small>Champion · Rank {championBuild.rank}</small>
                    <small className="socket-power" title={team.champion.leaderSkill?.effect}>
                      <Crown size={11} /> {team.champion.leaderSkill?.name ?? 'No aura'}
                    </small>
                  </span>
                </button>
                <SurvivalPip rate={survival.get(`champion-${championBuild.id}`)} />
                <button
                  type="button"
                  className="socket-remove"
                  aria-label="Remove champion"
                  onClick={() => update((current) => ({ ...current, championBuildId: '' }))}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button type="button" className="socket is-champion is-empty" onClick={() => setChoosing({ kind: 'champion' })}>
                <Crown size={20} />
                <span>Champion</span>
              </button>
            )}
          </li>
          {heroBuilds.map((build, slot) => {
            const resolved = team.heroes[slot];
            const benched = slot >= limit;
            const hero = build ? buildHero(repo, build) : undefined;
            return (
              <li
                key={slot}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, slot)}
                className={dragFrom === slot ? 'is-dragging' : ''}
              >
                {build && resolved ? (
                  <div
                    className={`socket is-filled ${benched ? 'is-benched' : ''}`}
                    draggable
                    onDragStart={() => setDragFrom(slot)}
                    onDragEnd={() => setDragFrom(null)}
                    title={benched ? `Not used: this quest takes ${limit} heroes. Drag to reorder.` : 'Drag to reorder'}
                  >
                    <button
                      type="button"
                      className="socket-main"
                      onClick={() => setChoosing({ kind: 'hero', slot })}
                      aria-label={`Slot ${slot + 1}: ${build.name}, change`}
                    >
                      <HeroCrest hero={hero} size="md" />
                      <span className="socket-text">
                        <strong>{build.name}</strong>
                        <small>{hero?.name}</small>
                        <small className="socket-power">{fmt(resolved.stats.power)} power</small>
                      </span>
                    </button>
                    {benched ? <span className="bench-label">bench</span> : <SurvivalPip rate={survival.get(`hero-${build.id}`)} />}
                    <button type="button" className="socket-remove" aria-label={`Remove ${build.name}`} onClick={() => setSlot(slot, null)}>
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`socket is-empty ${slot === TEAM_HERO_SLOTS - 1 ? 'is-optional' : ''}`}
                    onClick={() => setChoosing({ kind: 'hero', slot })}
                  >
                    <Plus size={18} />
                    <span>{slot === TEAM_HERO_SLOTS - 1 ? 'Lost City only' : `Hero ${slot + 1}`}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {choosing?.kind === 'hero' && (
        <HeroChooser
          title={`Hero for slot ${choosing.slot + 1}`}
          takenIds={party.heroBuildIds}
          onPick={(buildId) => {
            setSlot(choosing.slot, buildId);
            setChoosing(null);
          }}
          onRecruit={() => setChoosing({ kind: 'recruit', slot: choosing.slot })}
          onClose={() => setChoosing(null)}
        />
      )}
      {choosing?.kind === 'recruit' && (
        <ClassPicker
          title="Recruit a hero for this party"
          onPick={(heroClassId) => {
            const build = store.createHero(heroClassId);
            setSlot(choosing.slot, build.id);
            setChoosing(null);
            store.navigate({ page: 'hero', id: build.id });
            store.notify({ message: `${build.name} joined ${party.name}. Equip them here — the party updates automatically.`, tone: 'success' });
          }}
          onClose={() => setChoosing(null)}
        />
      )}
      {choosing?.kind === 'champion' && (
        <ChampionChooser
          currentId={party.championBuildId}
          onPick={(championBuildId) => {
            update((current) => ({ ...current, championBuildId }));
            setChoosing(null);
          }}
          onRecruit={() => {
            const build = store.createChampion();
            update((current) => ({ ...current, championBuildId: build.id }));
            setChoosing(null);
            store.navigate({ page: 'champion', id: build.id });
          }}
          onClose={() => setChoosing(null)}
        />
      )}
    </section>
  );
}

function SurvivalPip({ rate }: { rate: number | undefined }): JSX.Element | null {
  if (rate === undefined) {
    return null;
  }
  return (
    <span className="survival-pip" title={`Survives ${fmtPercent(rate)} of fights`}>
      <span style={{ width: `${rate}%`, background: heatColor(rate) }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Quest board (heatmap)
// ---------------------------------------------------------------------------

function QuestBoard({
  zones,
  cells,
  scanning,
  hasParty,
  selectedId,
  onSelect
}: {
  zones: QuestZone[];
  cells: Record<string, ScanCell>;
  scanning: boolean;
  hasParty: boolean;
  selectedId: string;
  onSelect: (quest: QuestData) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<ZoneGroup | 'All'>('All');
  const [winnableOnly, setWinnableOnly] = useState(false);
  const normalized = query.trim().toLowerCase();
  const done = Object.keys(cells).length;
  const total = zones.reduce((sum, zone) => sum + zone.quests.length, 0);

  const visible = zones.filter(
    (zone) =>
      (group === 'All' || zone.group === group) &&
      (!normalized || normalized.split(/\s+/).every((token) => zone.label.toLowerCase().includes(token))) &&
      (!winnableOnly || zone.quests.some((entry) => (cells[entry.id]?.winRate ?? 0) >= 90))
  );

  return (
    <section className="board" aria-label="Quest board">
      <div className="board-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search quests</span>
          <input value={query} placeholder="Find a zone or boss…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="filter-chips">
          {GROUPS.map((entry) => (
            <button key={entry} type="button" className={`chip ${group === entry ? 'is-active' : ''}`} onClick={() => setGroup(entry)}>
              {entry}
            </button>
          ))}
          <button
            type="button"
            className={`chip chip-toggle ${winnableOnly ? 'is-active' : ''}`}
            onClick={() => setWinnableOnly((value) => !value)}
            disabled={!hasParty}
          >
            <CheckCircle2 size={13} /> Farmable only
          </button>
        </div>
      </div>

      <div className="board-legend">
        <span className="legend-scale">
          <i style={{ background: 'var(--heat-0)' }} />
          <i style={{ background: 'var(--heat-1)' }} />
          <i style={{ background: 'var(--heat-2)' }} />
          <i style={{ background: 'var(--heat-3)' }} />
          <i style={{ background: 'var(--heat-4)' }} />
          <i style={{ background: 'var(--heat-5)' }} />
        </span>
        <span>lose → win</span>
        <span className="legend-note">
          {scanning ? (
            <>
              <Loader2 size={13} className="spin" /> Estimating {done}/{total} quests…
            </>
          ) : hasParty ? (
            `Quick estimate · ${SCAN_RUNS} fights per quest`
          ) : (
            'Add heroes to see win chances'
          )}
        </span>
      </div>

      <div className="board-table" role="table" aria-label="Win chance per quest">
        <div className="board-row board-head" role="row">
          <span role="columnheader">Quest</span>
          {DIFFICULTIES.map((difficulty) => (
            <span key={difficulty} role="columnheader">
              {difficulty}
            </span>
          ))}
        </div>
        {visible.map((zone, index) => {
          const types = [...new Set(zone.quests.map((entry) => entry.type))];
          const header = index === 0 || visible[index - 1].group !== zone.group ? zone.group : null;
          return (
            <div key={zone.key} className="board-zone">
              {header && group === 'All' && <h3 className="board-group">{header}</h3>}
              {types.map((type) => (
                <div key={type} className="board-row" role="row">
                  <span className="board-name" role="rowheader">
                    <strong>{type === 'Boss' && types.length > 1 ? `${zone.label} · Boss` : zone.label}</strong>
                    <ZoneMeta quests={zone.quests.filter((entry) => entry.type === type)} />
                  </span>
                  {DIFFICULTIES.map((difficulty) => {
                    const entry = zone.quests.find((candidate) => candidate.type === type && candidate.difficulty === difficulty);
                    if (!entry) {
                      return <span key={difficulty} className="board-cell is-none" role="cell" />;
                    }
                    const cell = cells[entry.id];
                    return (
                      <button
                        key={difficulty}
                        type="button"
                        role="cell"
                        className={`board-cell ${entry.id === selectedId ? 'is-selected' : ''} ${cell ? (cell.winRate < 0.5 ? 'is-zero' : '') : 'is-pending'}`}
                        style={cell ? { background: heatColor(cell.winRate) } : undefined}
                        onClick={() => onSelect(entry)}
                        aria-label={`${zone.label} ${type} ${difficulty}${cell ? `: ${Math.round(cell.winRate)}% win chance` : ''}`}
                      >
                        {cell ? `${Math.round(cell.winRate)}%` : hasParty ? '·' : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
        {visible.length === 0 && <p className="muted board-empty">No quests match these filters.</p>}
      </div>
    </section>
  );
}

function ZoneMeta({ quests }: { quests: QuestData[] }): JSX.Element {
  const sample = quests[0];
  const barrier = [...new Set(quests.flatMap((entry) => entry.barrierOptions).filter((entry) => entry && entry !== 'None'))];
  return (
    <small className="zone-meta">
      {sample ? `${partySize(sample)} heroes` : ''}
      {barrier.length > 0 && (
        <span title={`Barrier: ${barrier.join(' / ')}`}>
          {' · '}
          {barrier.map((element) => (
            <ElementGem key={element} element={elementKey(element)} size={10} />
          ))}
        </span>
      )}
    </small>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

const VERDICT_TONE: Record<string, string> = { reliable: 'good', likely: 'ok', risky: 'warn', unlikely: 'bad', fails: 'bad', empty: 'muted' };

function QuestDetail({
  quest,
  result,
  running,
  error,
  heroCount,
  miniBoss,
  runs,
  capOverride,
  onMiniBoss,
  onRuns,
  onCap
}: {
  quest: QuestData;
  result: TeamSimulationResult | null;
  running: boolean;
  error: string | null;
  heroCount: number;
  miniBoss: RessMiniBossModifier;
  runs: number;
  capOverride: number | undefined;
  onMiniBoss: (value: RessMiniBossModifier) => void;
  onRuns: (value: number) => void;
  onCap: (value: number | undefined) => void;
}): JSX.Element {
  const defaultCap = quest.defenseCap || estimateQuestDefenseCap(quest);
  const current = result && result.quest.id === quest.id ? result : null;
  const verdict = current?.analysis.verdict;
  const barrier = quest.barrierOptions.filter((entry) => entry && entry !== 'None');

  return (
    <div className={`detail ${running ? 'is-stale' : ''}`}>
      <header className="detail-header">
        <p className="eyebrow">
          {quest.type === 'Boss' ? 'Boss fight' : 'Quest'} · {quest.difficulty}
        </p>
        <h2>{formatZone(quest.zone)}</h2>
      </header>

      <div className="detail-verdict">
        {heroCount === 0 ? (
          <p className="muted">Add heroes to your party to simulate this quest.</p>
        ) : error ? (
          <p className="text-bad">Simulation failed: {error}</p>
        ) : verdict ? (
          <>
            <Gauge value={verdict.winRate} tone={VERDICT_TONE[verdict.level]} />
            <div className="verdict-copy">
              <span className={`verdict-badge tone-${VERDICT_TONE[verdict.level]}`}>{verdict.label}</span>
              <p>{verdict.headline}</p>
              {running && (
                <small className="muted">
                  <Loader2 size={12} className="spin" /> updating…
                </small>
              )}
            </div>
          </>
        ) : (
          <p className="muted">
            <Loader2 size={14} className="spin" /> Fighting {fmt(runs)} times…
          </p>
        )}
      </div>

      <Segmented<RessMiniBossModifier>
        label="Mini-boss"
        size="sm"
        value={miniBoss}
        options={MINI_BOSS_MODIFIERS.map((modifier) => ({ value: modifier, label: modifier }))}
        onChange={onMiniBoss}
      />

      {current && current.analysis.insights.length > 0 && (
        <section className="tips">
          <h3 className="panel-title">{verdict?.level === 'reliable' ? 'Notes' : 'What to improve'}</h3>
          <ul>
            {current.analysis.insights.map((insight) => (
              <Tip key={`${insight.code}-${insight.unitId ?? ''}`} insight={insight} />
            ))}
          </ul>
        </section>
      )}

      {current && (
        <section>
          <h3 className="panel-title">Your units</h3>
          <ul className="unit-rows">
            {current.simulation.rows.map((row) => (
              <li key={row.combatant.id} className="unit-row">
                <Crest role={row.combatant.kind === 'champion' ? 'champion' : row.combatant.role} size="sm" />
                <span className="unit-name">
                  <strong>{row.combatant.name}</strong>
                  <small>
                    takes {fmt(row.damagePerHit)}/hit · {fmtPercent(row.targetPercent, 0)} of attacks
                  </small>
                </span>
                <span className="unit-survival">
                  <span className="bar">
                    <span style={{ width: `${row.survivalRate}%`, background: heatColor(row.survivalRate) }} />
                  </span>
                  <b>{fmtPercent(row.survivalRate, 0)}</b>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <dd>{fmt(capOverride ?? defaultCap)}</dd>
        </div>
        <div>
          <dt>Party size</dt>
          <dd>{partySize(quest)}</dd>
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
              {fmt(quest.barrierHealth)}{' '}
              {barrier.map((element) => (
                <ElementGem key={element} element={elementKey(element)} />
              ))}
            </dd>
          </div>
        )}
      </dl>

      <details className="advanced">
        <summary>Fine-tune & all numbers</summary>
        <Segmented
          label="Simulated fights"
          size="sm"
          value={runs}
          options={[1000, 10000, 50000].map((value) => ({ value, label: `${value / 1000}K` }))}
          onChange={onRuns}
        />
        <NumberField
          label="Defense cap"
          value={capOverride ?? defaultCap}
          min={0}
          max={10_000_000}
          step={100}
          onChange={(value) => onCap(value)}
          hint={quest.defenseCap > 0 ? `Imported: ${fmt(quest.defenseCap)}` : 'Estimated — no exact value imported'}
        />
        {capOverride !== undefined && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCap(undefined)}>
            Reset to {fmt(defaultCap)}
          </button>
        )}
        {current && <NumbersTable result={current} />}
      </details>

      <p className="disclaimer">
        Port of Ress’ community simulator. Rest time, break chance, Tamas randomness and loot effects are not modelled — treat results as estimates.
      </p>
    </div>
  );
}

const TIP_ICON: Record<InsightSeverity, JSX.Element> = {
  critical: <XCircle size={17} />,
  warning: <AlertTriangle size={17} />,
  info: <Info size={17} />,
  success: <CheckCircle2 size={17} />
};

function Tip({ insight }: { insight: SimulationInsight }): JSX.Element {
  return (
    <li className={`tip tip-${insight.severity}`}>
      <span className="tip-icon" aria-label={insight.severity}>
        {insight.code === 'barrier-short' ? <ShieldAlert size={17} /> : TIP_ICON[insight.severity]}
      </span>
      <span>
        <strong>{insight.title}</strong>
        <small>{insight.detail}</small>
      </span>
    </li>
  );
}

function NumbersTable({ result }: { result: TeamSimulationResult }): JSX.Element {
  const sim = result.simulation;
  return (
    <>
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
              <th scope="col">Hit</th>
              <th scope="col">Crit hit</th>
              <th scope="col">Survives</th>
              <th scope="col">Avg dmg</th>
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
                <td>{fmt(row.averageDamageDealt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="facts">
        <div>
          <dt>Rounds min / avg / max</dt>
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
              {fmt(sim.barrier.available)} / {fmt(sim.barrier.required)}
            </dd>
          </div>
        )}
      </dl>
    </>
  );
}

function ScrollHint(): JSX.Element {
  return (
    <div className="detail-empty-art" aria-hidden="true">
      {DIFFICULTIES.map((difficulty, index) => (
        <span key={difficulty} style={{ background: `var(--heat-${index + 2})` }} />
      ))}
    </div>
  );
}

function partySize(quest: QuestData): number {
  return quest.lcog ? 5 : Math.min(4, quest.partySize || 4);
}

function omit<T extends Record<string, unknown>>(value: T, key: string): T {
  const { [key]: _removed, ...rest } = value;
  return rest as T;
}
