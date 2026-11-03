import { ArrowLeft, Copy, Crown, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QUALITY_LABELS } from '../../shared/data-utils';
import { calculateChampionBuildStats, getChampionMaxRank } from '../../shared/engine';
import type { ChampionBuildConfig, EquipmentSelection, StatBlock } from '../../shared/types';
import { ChampionCrest, ItemGlyph } from '../components/art';
import { ElementPoints, fmt, fmtSigned, itemStatSummary, StatList } from '../components/game';
import { ItemDrawer } from '../components/ItemDrawer';
import { ChampionTypePicker } from '../components/pickers';
import { EmptyState, NumberField, Switch } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

type GearSlotKey = 'familiar' | 'aurasong';

export function ChampionSheet({ id }: { id: string }): JSX.Element {
  const store = useStore();
  const build = store.champions.find((entry) => entry.id === id);
  if (!build) {
    return (
      <div className="page">
        <EmptyState
          title="This champion no longer exists"
          action={
            <button type="button" className="btn btn-primary" onClick={() => store.navigate({ page: 'barracks' })}>
              Back to the barracks
            </button>
          }
        />
      </div>
    );
  }
  return <Sheet key={build.id} build={build} />;
}

function Sheet({ build }: { build: ChampionBuildConfig }): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const [drawer, setDrawer] = useState<GearSlotKey | null>(null);
  const [preview, setPreview] = useState<StatBlock | null>(null);
  const [changing, setChanging] = useState(false);
  const resolved = useMemo(() => calculateChampionBuildStats(build, data), [build, data]);
  const champion = repo.champion(build.championId);
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  const update = (updater: (current: ChampionBuildConfig) => ChampionBuildConfig) => store.updateChampion(build.id, updater);
  const parties = store.teams.filter((team) => team.championBuildId === build.id);

  function changeChampion(championId: string): void {
    setChanging(false);
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

  const patch = (slot: GearSlotKey) => (change: Partial<EquipmentSelection>) =>
    update((current) => ({ ...current, [slot]: { ...current[slot], ...change } }));

  return (
    <div className={`page sheet ${drawer ? 'has-drawer' : ''}`}>
      <button type="button" className="back-link" onClick={() => store.navigate({ page: 'barracks' })}>
        <ArrowLeft size={16} /> Barracks
      </button>

      <header className="sheet-header">
        <ChampionCrest champion={champion} size="xl" />
        <div className="sheet-identity">
          <input
            className="name-input"
            aria-label="Champion name"
            value={build.name}
            onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
          />
          <div className="sheet-controls">
            <button
              type="button"
              className="class-button"
              onClick={() => setChanging(true)}
              aria-label={`Champion: ${champion?.name}. Change champion`}
            >
              <span className="role-text-champion">{champion?.name}</span>
              <small>change</small>
            </button>
            <NumberField
              label="Rank"
              value={build.rank}
              min={1}
              max={maxRank}
              onChange={(rank) => update((current) => ({ ...current, rank }))}
              hint={`Max ${maxRank}`}
            />
            <NumberField
              label="Power-ups"
              value={build.powerUps}
              min={0}
              max={999}
              onChange={(powerUps) => update((current) => ({ ...current, powerUps }))}
              hint="Ranks beyond max"
            />
            <Switch
              label="Champion Soul"
              description="×1.5 base stats, counts as +2 ranks"
              checked={build.championSoul}
              onChange={(championSoul) => update((current) => ({ ...current, championSoul }))}
            />
          </div>
          {parties.length > 0 && <p className="muted small">Leads: {parties.map((team) => team.name).join(', ')}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.duplicateChampion(build.id)}>
            <Copy size={15} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger"
            onClick={() => {
              store.deleteChampion(build.id);
              store.navigate({ page: 'barracks' });
            }}
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </header>

      <div className="sheet-body">
        <aside className="sheet-stats" aria-label="Stats">
          <div className="panel">
            <div className="power-line">
              <span>Power</span>
              <strong>{fmt(preview?.power ?? resolved.stats.power)}</strong>
              {preview && preview.power !== resolved.stats.power && (
                <em className={preview.power > resolved.stats.power ? 'is-up' : 'is-down'}>{fmtSigned(preview.power - resolved.stats.power)}</em>
              )}
            </div>
            <StatList stats={resolved.stats} preview={preview} />
          </div>
          <div className="panel">
            <h3 className="panel-title">Element points</h3>
            <ElementPoints scores={resolved.elementScores} empty="No elements." />
          </div>
        </aside>

        <section className="sheet-main">
          <div className="aura-banner">
            <Crown size={20} />
            <div>
              <p className="eyebrow">Party aura</p>
              <strong>{resolved.leaderSkill?.name ?? 'No aura at this rank'}</strong>
              {resolved.leaderSkill && <p>{resolved.leaderSkill.effect}</p>}
            </div>
          </div>

          <h2 className="section-title">Equipment</h2>
          <div className="doll doll-2">
            {(['familiar', 'aurasong'] as const).map((slot) => {
              const selection = build[slot];
              const item = repo.item(selection.itemId);
              const line = resolved.gear.find((entry) => entry.slotId === slot);
              const label = slot === 'familiar' ? 'Familiar' : 'Aurasong';
              return (
                <button
                  key={slot}
                  type="button"
                  className={`slot-tile ${item ? `q-${selection.quality}` : 'is-empty'} ${drawer === slot ? 'is-active' : ''}`}
                  onClick={() => setDrawer(drawer === slot ? null : slot)}
                  aria-label={`${label}: ${item ? item.name : 'empty'}`}
                >
                  <ItemGlyph item={item} quality={selection.quality} fallbackType={label} size="lg" />
                  <span className="slot-text">
                    <small>{label}</small>
                    {item ? (
                      <>
                        <strong>{item.name}</strong>
                        <span className={`quality-text q-${selection.quality}`}>
                          {QUALITY_LABELS[selection.quality]} · T{item.tier}
                        </span>
                        {line && <span className="slot-stats">{itemStatSummary(line.stats)}</span>}
                      </>
                    ) : (
                      <strong className="muted">Empty — choose</strong>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <h2 className="section-title">Seeds</h2>
          <div className="seed-row">
            {(['hp', 'attack', 'defense'] as const).map((key) => (
              <NumberField
                key={key}
                label={key === 'hp' ? 'HP seeds' : key === 'attack' ? 'ATK seeds' : 'DEF seeds'}
                value={build.seeds[key]}
                min={0}
                max={999}
                onChange={(value) => update((current) => ({ ...current, seeds: { ...current.seeds, [key]: value } }))}
              />
            ))}
          </div>
        </section>
      </div>

      {drawer && (
        <ItemDrawer
          eyebrow={drawer === 'familiar' ? 'Familiar' : 'Aurasong'}
          allowedTypes={[drawer === 'familiar' ? 'Familiar' : 'Aurasong']}
          selection={build[drawer]}
          maxTier={99}
          current={resolved.stats}
          previewFor={(change) => calculateChampionBuildStats({ ...build, [drawer]: { ...build[drawer], ...change } }, data).stats}
          onPreview={setPreview}
          onPatch={patch(drawer)}
          onClose={() => {
            setDrawer(null);
            setPreview(null);
          }}
        />
      )}
      {changing && <ChampionTypePicker currentId={build.championId} onPick={changeChampion} onClose={() => setChanging(false)} />}
    </div>
  );
}
