import { Copy, Download, Trash2, UserRound } from 'lucide-react';
import { useMemo } from 'react';
import { normalizeEquipmentForHero } from '../../shared/data-utils';
import { calculateHeroStats } from '../../shared/engine';
import type { BuildConfig, EquipmentSelection, HeroData } from '../../shared/types';
import { Combobox } from '../components/Combobox';
import { buildHero, ElementChips, HeroAvatar, heroClassOptions, PowerBadge, RoleLabel, skillOptions, StatGrid } from '../components/game';
import { GearSlot } from '../components/GearSlot';
import { ListPane } from '../components/ListPane';
import { Card, copyText, EmptyState, NumberField, Switch } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

export function HeroesView(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const selected = store.heroes.find((entry) => entry.id === store.prefs.heroId) ?? store.heroes[0];

  const entries = useMemo(
    () =>
      store.heroes.map((build) => {
        const promoted = buildHero(repo, build);
        return {
          id: build.id,
          title: build.name,
          subtitle: `${promoted?.name ?? 'Unknown'} · Lv ${build.level}`,
          leading: <HeroAvatar hero={promoted} size="sm" />,
          trailing: (
            <span className="muted tabular" title="Power">
              {calculateHeroStats(build, data).stats.power.toLocaleString('en-US')}
            </span>
          )
        };
      }),
    [store.heroes, repo, data]
  );

  if (store.heroes.length === 0) {
    return (
      <div className="view">
        <EmptyState
          icon={<UserRound size={32} />}
          title="Build your first hero"
          action={
            <button type="button" className="btn btn-primary" onClick={() => store.createHero()}>
              Create a hero
            </button>
          }
        >
          <p>Recreate the heroes you have in game: class, level, gear, enchantments and skills. TitanForge calculates their stats live.</p>
          <ol className="steps">
            <li className="is-current">Create heroes</li>
            <li>Put them in a team (with a champion)</li>
            <li>Simulate a quest and see what to improve</li>
          </ol>
          <p className="muted">
            Have a backup or AI-generated builds?{' '}
            <button type="button" className="link" onClick={() => store.setTab('data')}>
              Import them
            </button>
            .
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="view view-split">
      <ListPane
        label="Heroes"
        entries={entries}
        selectedId={selected?.id ?? ''}
        onSelect={(heroId) => store.setPrefs({ heroId })}
        onCreate={() => store.createHero()}
        createLabel="New hero"
      />
      {selected && <HeroEditor key={selected.id} build={selected} />}
    </div>
  );
}

function HeroEditor({ build }: { build: BuildConfig }): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const resolved = useMemo(() => calculateHeroStats(build, data), [build, data]);
  const baseHero = repo.hero(build.heroClassId);
  const hero = resolved.hero ?? baseHero;
  const maxTier = repo.maxTierForLevel(build.level);
  const classOptions = useMemo(() => heroClassOptions(data), [data]);
  const teamsUsing = store.teams.filter((team) => team.heroBuildIds.includes(build.id));

  const update = (updater: (current: BuildConfig) => BuildConfig) => store.updateHero(build.id, updater);

  function changeClass(heroClassId: string): void {
    const next = repo.hero(heroClassId);
    if (!next || next.id === build.heroClassId) {
      return;
    }
    const { equipment, removed } = carryOverGear(build, next, repo.item.bind(repo));
    const keepName = build.name !== baseHero?.name && !build.name.startsWith(`${baseHero?.name} `);
    update((current) => ({
      ...current,
      heroClassId: next.id,
      promoted: false,
      name: keepName ? current.name : next.name,
      skills: ['', '', '', ''],
      equipment
    }));
    store.notify({
      message: `Switched to ${next.name}.${removed.length > 0 ? ` Removed gear it can't use: ${removed.join(', ')}.` : ''}${
        build.skills.some(Boolean) ? ' Skills were cleared (they are class-specific).' : ''
      }`,
      tone: removed.length > 0 ? 'warning' : 'info'
    });
  }

  function setPromoted(promoted: boolean): void {
    if (!baseHero) {
      return;
    }
    const target = promoted && baseHero.promotedClassId ? (repo.hero(baseHero.promotedClassId) ?? baseHero) : baseHero;
    const { equipment, removed } = carryOverGear(build, target, repo.item.bind(repo));
    update((current) => ({ ...current, promoted, equipment }));
    if (removed.length > 0) {
      store.notify({ message: `Removed gear ${target.name} can't use: ${removed.join(', ')}.`, tone: 'warning' });
    }
  }

  function updateSlot(slotId: string, patch: Partial<EquipmentSelection>): void {
    update((current) => ({
      ...current,
      equipment: (hero ? normalizeEquipmentForHero(current, hero) : current.equipment).map((entry) =>
        entry.slotId === slotId ? { ...entry, ...patch } : entry
      )
    }));
  }

  return (
    <div className="editor">
      <div className="editor-main">
        <header className="editor-header">
          <HeroAvatar hero={hero} size="lg" />
          <div className="editor-title">
            <input
              className="title-input"
              aria-label="Hero name"
              value={build.name}
              onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
            />
            <span className="editor-subtitle">
              {hero && <RoleLabel role={hero.role} />} {hero?.name}
              {hero?.element && <span className="muted"> · {hero.element} hero</span>}
              {teamsUsing.length > 0 && <span className="muted"> · in {teamsUsing.map((team) => team.name).join(', ')}</span>}
            </span>
          </div>
          <div className="editor-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.duplicateHero(build.id)}>
              <Copy size={15} /> Duplicate
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () =>
                store.notify({
                  message: (await copyText(JSON.stringify(build, null, 2))) ? 'Build copied as JSON.' : 'Copy failed — use Data → Export.'
                })
              }
            >
              <Download size={15} /> Copy JSON
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => store.deleteHero(build.id)}>
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </header>

        <Card title="Class & level">
          <div className="form-row">
            <Combobox label="Class" value={build.heroClassId} options={classOptions} onChange={changeClass} placeholder="Search class…" />
            <NumberField
              label="Level"
              value={build.level}
              min={1}
              max={50}
              onChange={(level) => update((current) => ({ ...current, level }))}
              hint={`Gear up to tier ${maxTier}`}
            />
            <div className="field">
              <span className="field-label">Promotion</span>
              <Switch
                label={baseHero?.promotedClassName ? `Promoted to ${baseHero.promotedClassName}` : 'No promotion'}
                description={baseHero?.promotedClassName ? 'Titan Soul class promotion' : undefined}
                checked={build.promoted}
                disabled={!baseHero?.promotedClassId}
                onChange={setPromoted}
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

        <Card
          title="Gear"
          actions={
            <span className="muted">
              Up to tier {maxTier} at level {build.level}
            </span>
          }
        >
          <div className="gear-grid">
            {hero?.slots.map((slot, index) => (
              <GearSlot
                key={slot.id}
                index={index}
                title={slot.label}
                allowedTypes={slot.allowedTypes}
                selection={build.equipment.find((entry) => entry.slotId === slot.id) ?? emptySelection(slot.id)}
                resolved={resolved.gear.find((line) => line.slotId === slot.id)}
                maxTier={maxTier}
                onChange={(patch) => updateSlot(slot.id, patch)}
              />
            ))}
          </div>
        </Card>

        <Card title="Skills">
          <div className="skill-grid">
            {[0, 1, 2, 3].map((index) => {
              const value = build.skills[index] ?? '';
              const taken = build.skills.filter((skillId, other) => skillId && other !== index);
              const skill = repo.skill(value);
              return (
                <div key={index} className="skill-slot">
                  <Combobox
                    label={`Skill ${index + 1}`}
                    value={value}
                    options={skillOptions(data, hero ?? undefined, taken)}
                    onChange={(skillId) =>
                      update((current) => {
                        const skills = [...current.skills, '', '', '', ''].slice(0, 4);
                        skills[index] = skillId;
                        return { ...current, skills };
                      })
                    }
                    placeholder="Empty — search skills…"
                    clearable
                  />
                  {skill && <p className="skill-effect">{skill.effect}</p>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <aside className="editor-summary" aria-label="Hero summary">
        <div className="summary-sticky">
          <Card>
            <PowerBadge value={resolved.stats.power} size="lg" />
            <StatGrid stats={resolved.stats} />
          </Card>
          <Card title="Element points">
            <ElementChips scores={resolved.elementScores} empty="No elements yet — add elements to gear to break quest barriers." />
          </Card>
          {resolved.innateSkills.length > 0 && (
            <Card title="Innate">
              {resolved.innateSkills.map((skill) => (
                <div key={skill.id} className="innate">
                  <strong>{skill.name}</strong>
                  <p>{skill.effect}</p>
                </div>
              ))}
            </Card>
          )}
          {resolved.warnings.length > 0 && (
            <div className="callout callout-warning" role="note">
              <strong>Check this build</strong>
              <ul>
                {resolved.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted small">Champion auras are added when the hero is in a team.</p>
        </div>
      </aside>
    </div>
  );
}

/** Keeps every item the new class can still wear in the same slot. */
function carryOverGear(
  build: BuildConfig,
  hero: HeroData,
  getItem: (id: string) => { name: string; type: string } | undefined
): { equipment: EquipmentSelection[]; removed: string[] } {
  const removed: string[] = [];
  const bySlot = new Map(build.equipment.map((entry) => [entry.slotId, entry]));
  const equipment = hero.slots.map((slot) => {
    const current = bySlot.get(slot.id);
    const item = current?.itemId ? getItem(current.itemId) : undefined;
    if (current && item && slot.allowedTypes.includes(item.type)) {
      return current;
    }
    if (item) {
      removed.push(item.name);
    }
    return emptySelection(slot.id);
  });
  return { equipment, removed };
}

function emptySelection(slotId: string): EquipmentSelection {
  return { slotId, itemId: '', quality: 'normal', elementId: '', spiritId: '', starforged: false };
}
