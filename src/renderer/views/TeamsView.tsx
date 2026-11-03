import { ArrowDown, ArrowUp, Copy, Crown, Plus, Search, Swords, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { calculateChampionBuildStats, calculateHeroStats } from '../../shared/engine';
import { resolveTeam, TEAM_HERO_SLOTS } from '../../shared/team';
import type { BuildConfig, ChampionBuildConfig, RosterConfig } from '../../shared/types';
import { Avatar, buildHero, ChampionAvatar, ElementChips, fmt, HeroAvatar, PowerBadge, StatGrid, StatLine } from '../components/game';
import { ListPane } from '../components/ListPane';
import { Card, Dialog } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

type Picker = { kind: 'hero'; slot: number } | { kind: 'champion' } | null;

export function TeamsView(): JSX.Element {
  const { repo } = useGame();
  const store = useStore();
  const team = store.teams.find((entry) => entry.id === store.prefs.teamId) ?? store.teams[0];

  const entries = useMemo(
    () =>
      store.teams.map((entry) => {
        const heroes = entry.heroBuildIds.map((id) => store.heroes.find((build) => build.id === id)).filter(Boolean) as BuildConfig[];
        const champion = store.champions.find((build) => build.id === entry.championBuildId);
        return {
          id: entry.id,
          title: entry.name,
          subtitle: `${heroes.length} hero${heroes.length === 1 ? '' : 'es'}${champion ? ` · ${champion.name}` : ' · no champion'}`,
          leading: (
            <span className="avatar-stack">
              {heroes.slice(0, 3).map((build) => (
                <Avatar key={build.id} name={buildHero(repo, build)?.name ?? '?'} role={buildHero(repo, build)?.role} size="sm" />
              ))}
              {heroes.length === 0 && <Avatar name="?" size="sm" />}
            </span>
          )
        };
      }),
    [store.teams, store.heroes, store.champions, repo]
  );

  return (
    <div className="view view-split">
      <ListPane
        label="Teams"
        entries={entries}
        selectedId={team?.id ?? ''}
        onSelect={(teamId) => store.setPrefs({ teamId })}
        onCreate={() => store.createTeam()}
        createLabel="New team"
      />
      {team && <TeamEditor key={team.id} team={team} />}
    </div>
  );
}

function TeamEditor({ team }: { team: RosterConfig }): JSX.Element {
  const { data } = useGame();
  const store = useStore();
  const [picker, setPicker] = useState<Picker>(null);
  const heroBuilds = useMemo(
    () => team.heroBuildIds.map((id) => store.heroes.find((build) => build.id === id) ?? null),
    [team.heroBuildIds, store.heroes]
  );
  const championBuild = store.champions.find((build) => build.id === team.championBuildId) ?? null;
  const resolved = useMemo(() => resolveTeam({ heroes: heroBuilds, champion: championBuild }, data), [heroBuilds, championBuild, data]);
  const update = (updater: (current: RosterConfig) => RosterConfig) => store.updateTeam(team.id, updater);

  function setSlot(slot: number, buildId: string | null): void {
    update((current) => {
      const ids = [...current.heroBuildIds];
      // A hero can only be in one slot of the same team.
      const existing = ids.indexOf(buildId);
      if (buildId && existing !== -1) {
        ids[existing] = ids[slot];
      }
      ids[slot] = buildId;
      return { ...current, heroBuildIds: ids };
    });
  }

  function move(slot: number, delta: number): void {
    update((current) => {
      const ids = [...current.heroBuildIds];
      const target = slot + delta;
      [ids[slot], ids[target]] = [ids[target], ids[slot]];
      return { ...current, heroBuildIds: ids };
    });
  }

  const totalPower = resolved.totals.power;

  return (
    <div className="editor">
      <div className="editor-main">
        <header className="editor-header">
          <div className="editor-title">
            <input
              className="title-input"
              aria-label="Team name"
              value={team.name}
              onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
            />
            <span className="editor-subtitle">
              {resolved.heroCount} of {TEAM_HERO_SLOTS} heroes · {championBuild ? championBuild.name : 'no champion'} · Power {fmt(totalPower)}
            </span>
          </div>
          <div className="editor-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={resolved.heroCount === 0}
              onClick={() => {
                store.setPrefs({ teamId: team.id });
                store.setTab('simulate');
              }}
            >
              <Swords size={16} /> Simulate this team
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.duplicateTeam(team.id)}>
              <Copy size={15} /> Duplicate
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => store.deleteTeam(team.id)}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </header>

        <Card title="Champion">
          {championBuild && resolved.champion ? (
            <div className="slot-card is-filled champion-slot">
              <ChampionAvatar champion={resolved.champion.champion} />
              <div className="slot-card-body">
                <strong>{championBuild.name}</strong>
                <span className="muted">
                  {resolved.champion.champion?.name} · Rank {championBuild.rank}
                </span>
                {resolved.champion.leaderSkill && (
                  <span className="aura-line" title={resolved.champion.leaderSkill.effect}>
                    <Crown size={13} /> {resolved.champion.leaderSkill.name}: {resolved.champion.leaderSkill.effect}
                  </span>
                )}
              </div>
              <div className="slot-card-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker({ kind: 'champion' })}>
                  Change
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label="Remove champion"
                  onClick={() => update((current) => ({ ...current, championBuildId: '' }))}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="slot-card is-empty" onClick={() => setPicker({ kind: 'champion' })}>
              <Crown size={20} />
              <span>
                <strong>Add a champion</strong>
                <small>Their aura boosts every hero in the team.</small>
              </span>
            </button>
          )}
        </Card>

        <Card title="Heroes" actions={<span className="muted">Order matters: smaller parties take heroes from the top.</span>}>
          <ol className="slot-list">
            {heroBuilds.map((build, slot) => {
              const resolvedHero = resolved.heroes[slot];
              const lcogOnly = slot === TEAM_HERO_SLOTS - 1;
              return (
                <li key={slot}>
                  <span className="slot-number" title={lcogOnly ? 'Only used in Lost City of Gold quests' : undefined}>
                    {slot + 1}
                    {lcogOnly && <small>LCoG</small>}
                  </span>
                  {build && resolvedHero ? (
                    <div className="slot-card is-filled">
                      <HeroAvatar hero={resolvedHero.hero} />
                      <div className="slot-card-body">
                        <button
                          type="button"
                          className="link slot-card-name"
                          onClick={() => {
                            store.setPrefs({ heroId: build.id });
                            store.setTab('heroes');
                          }}
                        >
                          {build.name}
                        </button>
                        <span className="muted">
                          {resolvedHero.hero?.name} · Lv {build.level} · Power {fmt(resolvedHero.stats.power)}
                        </span>
                        <StatLine stats={resolvedHero.stats} />
                      </div>
                      <div className="slot-card-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          aria-label={`Move ${build.name} up`}
                          disabled={slot === 0}
                          onClick={() => move(slot, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          aria-label={`Move ${build.name} down`}
                          disabled={slot === TEAM_HERO_SLOTS - 1}
                          onClick={() => move(slot, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker({ kind: 'hero', slot })}>
                          Swap
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          aria-label={`Remove ${build.name} from team`}
                          onClick={() => setSlot(slot, null)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`slot-card is-empty ${lcogOnly ? 'is-optional' : ''}`}
                      onClick={() => setPicker({ kind: 'hero', slot })}
                    >
                      <UserPlus size={20} />
                      <span>
                        <strong>Add hero</strong>
                        <small>{lcogOnly ? 'Optional — only Lost City of Gold quests take a 5th hero.' : 'Pick one of your heroes.'}</small>
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>

      <aside className="editor-summary" aria-label="Team summary">
        <div className="summary-sticky">
          <Card title="Team totals">
            <PowerBadge value={totalPower} size="lg" />
            <StatGrid stats={resolved.totals} keys={['hp', 'attack', 'defense', 'threat']} />
            <p className="muted small">Sums of all units, hero stats include the champion aura. Crit and evasion are per unit — see each hero.</p>
          </Card>
          <Card title="Element points">
            <ElementChips scores={resolved.elementScores} empty="No elements. Barrier quests need element points to break shields." />
          </Card>
        </div>
      </aside>

      {picker?.kind === 'hero' && (
        <HeroPicker
          team={team}
          slot={picker.slot}
          onClose={() => setPicker(null)}
          onPick={(buildId) => {
            setSlot(picker.slot, buildId);
            setPicker(null);
          }}
          onCreate={() => {
            const build = store.createHero();
            setSlot(picker.slot, build.id);
            setPicker(null);
            store.setTab('heroes');
            store.notify({
              message: `“${build.name}” added to ${team.name}. Set up its gear here — it updates the team automatically.`,
              tone: 'success'
            });
          }}
        />
      )}
      {picker?.kind === 'champion' && (
        <ChampionPicker
          selectedId={team.championBuildId}
          onClose={() => setPicker(null)}
          onPick={(championBuildId) => {
            update((current) => ({ ...current, championBuildId }));
            setPicker(null);
          }}
          onCreate={() => {
            const build = store.createChampion();
            update((current) => ({ ...current, championBuildId: build.id }));
            setPicker(null);
            store.setTab('champions');
          }}
        />
      )}
    </div>
  );
}

function HeroPicker({
  team: currentTeam,
  slot,
  onClose,
  onPick,
  onCreate
}: {
  team: RosterConfig;
  slot: number;
  onClose: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
}): JSX.Element {
  const { data } = useGame();
  const store = useStore();
  const [query, setQuery] = useState('');
  const normalized = normalizeSearch(query);
  const options = store.heroes
    .map((build) => ({ build, resolved: calculateHeroStats(build, data) }))
    .filter(({ build, resolved: entry }) => !normalized || normalizeSearch(`${build.name} ${entry.hero?.name ?? ''}`).includes(normalized));
  return (
    <Dialog
      title={`Choose hero for slot ${slot + 1}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onCreate}>
          <Plus size={16} /> Create a new hero instead
        </button>
      }
    >
      <label className="list-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search heroes</span>
        <input autoFocus value={query} placeholder="Search by name or class…" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <ul className="picker-list">
        {options.map(({ build, resolved: entry }) => {
          const inSlot = currentTeam.heroBuildIds.indexOf(build.id);
          return (
            <li key={build.id}>
              <button type="button" className="picker-option" onClick={() => onPick(build.id)}>
                <HeroAvatar hero={entry.hero} size="sm" />
                <span className="list-entry-text">
                  <strong>{build.name}</strong>
                  <small>
                    {entry.hero?.name} · Lv {build.level} · Power {fmt(entry.stats.power)}
                  </small>
                </span>
                {inSlot !== -1 && <span className="tag">{inSlot === slot ? 'Current' : `In slot ${inSlot + 1} — will swap`}</span>}
              </button>
            </li>
          );
        })}
        {store.heroes.length === 0 && <li className="muted">You have no heroes yet.</li>}
        {store.heroes.length > 0 && options.length === 0 && <li className="muted">No hero matches “{query}”.</li>}
      </ul>
    </Dialog>
  );
}

function ChampionPicker({
  selectedId,
  onClose,
  onPick,
  onCreate
}: {
  selectedId: string;
  onClose: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
}): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  return (
    <Dialog
      title="Choose champion"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onCreate}>
          <Plus size={16} /> Create a new champion instead
        </button>
      }
    >
      <ul className="picker-list">
        {store.champions.map((build: ChampionBuildConfig) => {
          const entry = calculateChampionBuildStats(build, data);
          return (
            <li key={build.id}>
              <button type="button" className="picker-option" onClick={() => onPick(build.id)}>
                <ChampionAvatar champion={repo.champion(build.championId)} size="sm" />
                <span className="list-entry-text">
                  <strong>{build.name}</strong>
                  <small>
                    Rank {build.rank} · {entry.leaderSkill?.name ?? 'no aura'} · Power {fmt(entry.stats.power)}
                  </small>
                </span>
                {build.id === selectedId && <span className="tag">Current</span>}
              </button>
            </li>
          );
        })}
        {store.champions.length === 0 && <li className="muted">You have no champions yet.</li>}
      </ul>
    </Dialog>
  );
}
