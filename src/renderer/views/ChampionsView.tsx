import { Copy, Crown, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { calculateChampionBuildStats, getChampionMaxRank } from '../../shared/engine';
import type { ChampionBuildConfig, EquipmentSelection } from '../../shared/types';
import { Combobox } from '../components/Combobox';
import { ChampionAvatar, ElementChips, PowerBadge, StatGrid } from '../components/game';
import { GearSlot } from '../components/GearSlot';
import { ListPane } from '../components/ListPane';
import { Card, EmptyState, NumberField, Switch } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

export function ChampionsView(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const selected = store.champions.find((entry) => entry.id === store.prefs.championId) ?? store.champions[0];

  const entries = useMemo(
    () =>
      store.champions.map((build) => {
        const champion = repo.champion(build.championId);
        return {
          id: build.id,
          title: build.name,
          subtitle: `${champion?.name ?? 'Unknown'} · Rank ${build.rank}${build.championSoul ? ' · Soul' : ''}`,
          leading: <ChampionAvatar champion={champion} size="sm" />,
          trailing: <span className="muted tabular">{calculateChampionBuildStats(build, data).stats.power.toLocaleString('en-US')}</span>
        };
      }),
    [store.champions, repo, data]
  );

  if (store.champions.length === 0) {
    return (
      <div className="view">
        <EmptyState
          icon={<Crown size={32} />}
          title="Add your champion"
          action={
            <button type="button" className="btn btn-primary" onClick={() => store.createChampion()}>
              Add a champion
            </button>
          }
        >
          <p>A champion fights alongside your heroes and boosts the whole party with their aura. One champion per team.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="view view-split">
      <ListPane
        label="Champions"
        entries={entries}
        selectedId={selected?.id ?? ''}
        onSelect={(championId) => store.setPrefs({ championId })}
        onCreate={() => store.createChampion()}
        createLabel="New champion"
      />
      {selected && <ChampionEditor key={selected.id} build={selected} />}
    </div>
  );
}

function ChampionEditor({ build }: { build: ChampionBuildConfig }): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const resolved = useMemo(() => calculateChampionBuildStats(build, data), [build, data]);
  const champion = repo.champion(build.championId);
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  const update = (updater: (current: ChampionBuildConfig) => ChampionBuildConfig) => store.updateChampion(build.id, updater);
  const championOptions = useMemo(
    () =>
      data.champions.map((entry) => ({
        value: entry.id,
        label: entry.name,
        detail: `${entry.element}${entry.guest ? ' · Guest' : ''}`,
        leading: <ChampionAvatar champion={entry} size="sm" />
      })),
    [data]
  );

  function changeChampion(championId: string): void {
    const next = repo.champion(championId);
    if (!next) {
      return;
    }
    update((current) => ({
      ...current,
      championId,
      name: current.name === champion?.name ? next.name : current.name,
      rank: getChampionMaxRank(next),
      powerUps: 0
    }));
  }

  const updateGear = (slot: 'familiar' | 'aurasong') => (patch: Partial<EquipmentSelection>) =>
    update((current) => ({ ...current, [slot]: { ...current[slot], ...patch } }));

  return (
    <div className="editor">
      <div className="editor-main">
        <header className="editor-header">
          <ChampionAvatar champion={champion} size="lg" />
          <div className="editor-title">
            <input
              className="title-input"
              aria-label="Champion name"
              value={build.name}
              onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
            />
            <span className="editor-subtitle">
              {champion?.name} · {champion?.element} {champion?.guest ? '· Guest champion' : ''}
            </span>
          </div>
          <div className="editor-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.duplicateChampion(build.id)}>
              <Copy size={15} /> Duplicate
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => store.deleteChampion(build.id)}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </header>

        <Card title="Champion">
          <div className="form-row">
            <Combobox label="Champion" value={build.championId} options={championOptions} onChange={changeChampion} />
            <NumberField
              label="Rank"
              value={build.rank}
              min={1}
              max={maxRank}
              onChange={(rank) => update((current) => ({ ...current, rank }))}
              hint={`Max rank ${maxRank}`}
            />
            <NumberField label="Level" value={build.level} min={1} max={50} onChange={(level) => update((current) => ({ ...current, level }))} />
          </div>
          <div className="form-row">
            <NumberField
              label="Power-ups (+X ranks)"
              value={build.powerUps}
              min={0}
              max={999}
              onChange={(powerUps) => update((current) => ({ ...current, powerUps }))}
              hint="Repeatable rank rewards after max rank"
            />
            <div className="field">
              <span className="field-label">Champion Soul</span>
              <Switch
                label="Soul active"
                description="×1.5 base stats, +2 aura ranks"
                checked={build.championSoul}
                onChange={(championSoul) => update((current) => ({ ...current, championSoul }))}
              />
            </div>
          </div>
          <div className="form-row form-row-3">
            {(['attack', 'defense', 'hp'] as const).map((key) => (
              <NumberField
                key={key}
                label={`${key === 'hp' ? 'HP' : key === 'attack' ? 'ATK' : 'DEF'} seeds`}
                value={build.seeds[key]}
                min={0}
                max={999}
                onChange={(value) => update((current) => ({ ...current, seeds: { ...current.seeds, [key]: value } }))}
              />
            ))}
          </div>
        </Card>

        <Card title="Familiar & Aurasong">
          <div className="gear-grid gear-grid-2">
            <GearSlot
              title="Familiar"
              allowedTypes={['Familiar']}
              selection={build.familiar}
              resolved={resolved.gear.find((line) => line.slotId === 'familiar')}
              maxTier={99}
              onChange={updateGear('familiar')}
            />
            <GearSlot
              title="Aurasong"
              allowedTypes={['Aurasong']}
              selection={build.aurasong}
              resolved={resolved.gear.find((line) => line.slotId === 'aurasong')}
              maxTier={99}
              onChange={updateGear('aurasong')}
            />
          </div>
        </Card>
      </div>

      <aside className="editor-summary" aria-label="Champion summary">
        <div className="summary-sticky">
          <Card>
            <PowerBadge value={resolved.stats.power} size="lg" />
            <StatGrid stats={resolved.stats} />
          </Card>
          <Card title="Party aura">
            {resolved.leaderSkill ? (
              <div className="innate">
                <strong>{resolved.leaderSkill.name}</strong>
                <p>{resolved.leaderSkill.effect}</p>
              </div>
            ) : (
              <p className="muted">No aura at this rank.</p>
            )}
          </Card>
          <Card title="Element points">
            <ElementChips scores={resolved.elementScores} empty="No elements." />
          </Card>
          {resolved.warnings.length > 0 && (
            <div className="callout callout-warning" role="note">
              <ul>
                {resolved.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
