import { ArrowLeft, Copy, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { normalizeEquipmentForHero, QUALITY_LABELS } from '../../shared/data-utils';
import { calculateHeroStats } from '../../shared/engine';
import type { BuildConfig, EquipmentSelection, HeroData, ItemData, StatBlock } from '../../shared/types';
import { ElementGem, HeroCrest, ItemGlyph } from '../components/art';
import { builtInEnchantment, buildHero, ElementPoints, fmt, fmtSigned, itemStatSummary, skillsFor, StatList } from '../components/game';
import { emptySelection, ItemDrawer } from '../components/ItemDrawer';
import { ClassPicker } from '../components/pickers';
import { EmptyState, NumberField, Switch } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

type Drawer = { kind: 'slot'; index: number } | { kind: 'skill'; index: number } | null;

export function HeroSheet({ id }: { id: string }): JSX.Element {
  const store = useStore();
  const build = store.heroes.find((entry) => entry.id === id);
  if (!build) {
    return (
      <div className="page">
        <EmptyState
          title="This hero no longer exists"
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

function Sheet({ build }: { build: BuildConfig }): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [preview, setPreview] = useState<StatBlock | null>(null);
  const [changingClass, setChangingClass] = useState(false);
  const resolved = useMemo(() => calculateHeroStats(build, data), [build, data]);
  const base = repo.hero(build.heroClassId);
  const hero = buildHero(repo, build) ?? base;
  const maxTier = repo.maxTierForLevel(build.level);
  const parties = store.teams.filter((team) => team.heroBuildIds.includes(build.id));

  const update = (updater: (current: BuildConfig) => BuildConfig) => store.updateHero(build.id, updater);

  function changeClass(heroClassId: string): void {
    setChangingClass(false);
    const next = repo.hero(heroClassId);
    if (!next || next.id === build.heroClassId) {
      return;
    }
    const { equipment, removed } = carryOverGear(build, next, (itemId) => repo.item(itemId));
    const autoNamed = build.name === base?.name || build.name.startsWith(`${base?.name} `);
    update((current) => ({
      ...current,
      heroClassId: next.id,
      promoted: false,
      name: autoNamed ? next.name : current.name,
      skills: ['', '', '', ''],
      equipment
    }));
    store.notify({
      message: `Now a ${next.name}.${removed.length > 0 ? ` Unequipped: ${removed.join(', ')}.` : ''}${build.skills.some(Boolean) ? ' Skills were cleared.' : ''}`,
      tone: removed.length > 0 ? 'warning' : 'info'
    });
  }

  function setPromoted(promoted: boolean): void {
    if (!base) {
      return;
    }
    const target = promoted && base.promotedClassId ? (repo.hero(base.promotedClassId) ?? base) : base;
    const { equipment, removed } = carryOverGear(build, target, (itemId) => repo.item(itemId));
    update((current) => ({ ...current, promoted, equipment }));
    if (removed.length > 0) {
      store.notify({ message: `Unequipped what ${target.name} can't use: ${removed.join(', ')}.`, tone: 'warning' });
    }
  }

  function patchSlot(slotId: string, patch: Partial<EquipmentSelection>): void {
    update((current) => ({
      ...current,
      equipment: (hero ? normalizeEquipmentForHero(current, hero) : current.equipment).map((entry) =>
        entry.slotId === slotId ? { ...entry, ...patch } : entry
      )
    }));
  }

  const closeDrawer = () => {
    setDrawer(null);
    setPreview(null);
  };

  return (
    <div className={`page sheet ${drawer ? 'has-drawer' : ''}`}>
      <button type="button" className="back-link" onClick={() => store.navigate({ page: 'barracks' })}>
        <ArrowLeft size={16} /> Barracks
      </button>

      <header className="sheet-header">
        <HeroCrest hero={hero} size="xl" />
        <div className="sheet-identity">
          <input
            className="name-input"
            aria-label="Hero name"
            value={build.name}
            onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
          />
          <div className="sheet-controls">
            <button type="button" className="class-button" onClick={() => setChangingClass(true)} aria-label={`Class: ${base?.name}. Change class`}>
              <span className={`role-text-${hero?.role}`}>{hero?.name}</span>
              <small>change</small>
            </button>
            {base?.promotedClassId && (
              <Switch label={`Promoted`} description={`Titan Soul → ${base.promotedClassName}`} checked={build.promoted} onChange={setPromoted} />
            )}
            <NumberField
              label="Level"
              value={build.level}
              min={1}
              max={50}
              onChange={(level) => update((current) => ({ ...current, level }))}
              hint={`Gear up to T${maxTier}`}
            />
          </div>
          {parties.length > 0 && <p className="muted small">In party: {parties.map((team) => team.name).join(', ')}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.duplicateHero(build.id)}>
            <Copy size={15} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger"
            onClick={() => {
              store.deleteHero(build.id);
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
            {preview && <p className="preview-note">Previewing — click the item to equip it.</p>}
          </div>
          <div className="panel">
            <h3 className="panel-title">Element points</h3>
            <ElementPoints scores={resolved.elementScores} empty="No elements yet. Barrier quests need them." />
          </div>
          {resolved.innateSkills.map((skill) => (
            <div key={skill.id} className="panel">
              <h3 className="panel-title">Innate · {skill.name}</h3>
              <p className="small">{skill.effect}</p>
            </div>
          ))}
          {resolved.warnings.length > 0 && (
            <div className="panel panel-warning" role="note">
              {resolved.warnings.map((warning) => (
                <p key={warning} className="small">
                  {warning}
                </p>
              ))}
            </div>
          )}
        </aside>

        <section className="sheet-main">
          <h2 className="section-title">Equipment</h2>
          <div className="doll">
            {hero?.slots.map((slot, index) => {
              const selection = build.equipment.find((entry) => entry.slotId === slot.id);
              const item = repo.item(selection?.itemId);
              const line = resolved.gear.find((entry) => entry.slotId === slot.id);
              const element = builtInEnchantment(data, item, 'Element') ?? repo.enchantment(selection?.elementId);
              const spirit = builtInEnchantment(data, item, 'Spirit') ?? repo.enchantment(selection?.spiritId);
              const active = drawer?.kind === 'slot' && drawer.index === index;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`slot-tile ${item ? `q-${selection?.quality}` : 'is-empty'} ${active ? 'is-active' : ''}`}
                  onClick={() => setDrawer(active ? null : { kind: 'slot', index })}
                  aria-label={`Slot ${index + 1}: ${item ? item.name : 'empty'}`}
                >
                  <ItemGlyph
                    item={item}
                    quality={selection?.quality}
                    fallbackType={slot.allowedTypes[0]}
                    size="lg"
                    starforged={selection?.starforged}
                  />
                  <span className="slot-text">
                    <small>{slot.allowedTypes.join(' · ')}</small>
                    {item ? (
                      <>
                        <strong>{item.name}</strong>
                        <span className={`quality-text q-${selection?.quality}`}>
                          {QUALITY_LABELS[selection?.quality ?? 'normal']} · T{item.tier}
                        </span>
                        <span className="slot-enchants">
                          {element && (
                            <span>
                              <ElementGem element={Object.keys(element.elementScores)[0] ?? 'all'} /> {element.name.replace(/ Element$/, '')}
                            </span>
                          )}
                          {spirit && <span>✦ {spirit.name.replace(/ Spirit$/, '')}</span>}
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

          <h2 className="section-title">Skills</h2>
          <div className="skill-sockets">
            {[0, 1, 2, 3].map((index) => {
              const skill = repo.skill(build.skills[index]);
              const active = drawer?.kind === 'skill' && drawer.index === index;
              return (
                <button
                  key={index}
                  type="button"
                  className={`skill-socket ${skill ? '' : 'is-empty'} ${active ? 'is-active' : ''}`}
                  onClick={() => setDrawer(active ? null : { kind: 'skill', index })}
                >
                  <span className="skill-tier">{skill ? `T${skill.tier}` : index + 1}</span>
                  <span>
                    <strong>{skill?.name ?? 'Empty skill slot'}</strong>
                    <small>{skill?.effect ?? 'Choose a skill'}</small>
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

      {drawer?.kind === 'slot' && hero && (
        <ItemDrawer
          eyebrow={`Slot ${drawer.index + 1}`}
          allowedTypes={hero.slots[drawer.index].allowedTypes}
          selection={build.equipment.find((entry) => entry.slotId === hero.slots[drawer.index].id) ?? emptySelection(hero.slots[drawer.index].id)}
          maxTier={maxTier}
          current={resolved.stats}
          previewFor={(patch) =>
            calculateHeroStats(
              {
                ...build,
                equipment: build.equipment.map((entry) => (entry.slotId === hero.slots[drawer.index].id ? { ...entry, ...patch } : entry))
              },
              data
            ).stats
          }
          onPreview={setPreview}
          onPatch={(patch) => patchSlot(hero.slots[drawer.index].id, patch)}
          onClose={closeDrawer}
        />
      )}
      {drawer?.kind === 'skill' && hero && (
        <SkillDrawer
          build={build}
          hero={hero}
          index={drawer.index}
          onPick={(skillId) => {
            update((current) => {
              const skills = [...current.skills, '', '', '', ''].slice(0, 4);
              skills[drawer.index] = skillId;
              return { ...current, skills };
            });
            closeDrawer();
          }}
          onClose={closeDrawer}
        />
      )}
      {changingClass && (
        <ClassPicker title="Change class" currentId={build.heroClassId} onPick={changeClass} onClose={() => setChangingClass(false)} />
      )}
    </div>
  );
}

function SkillDrawer({
  build,
  hero,
  index,
  onPick,
  onClose
}: {
  build: BuildConfig;
  hero: HeroData;
  index: number;
  onPick: (skillId: string) => void;
  onClose: () => void;
}): JSX.Element {
  const { data } = useGame();
  const [query, setQuery] = useState('');
  const normalized = normalizeSearch(query);
  const taken = build.skills.filter((skillId, other) => skillId && other !== index);
  const current = build.skills[index] ?? '';
  const skills = skillsFor(data, hero).filter((skill) => !normalized || normalizeSearch(`${skill.name} ${skill.effect}`).includes(normalized));
  const classSkills = skills.filter((skill) => skill.classes.length > 0 && !/all classes/i.test(skill.classes.join()));
  const generalSkills = skills.filter((skill) => !classSkills.includes(skill));

  const renderGroup = (title: string, list: typeof skills) =>
    list.length > 0 && (
      <>
        <h3 className="panel-title">{title}</h3>
        <ul className="item-list">
          {list.map((skill) => (
            <li key={skill.id}>
              <button
                type="button"
                className={`skill-option ${skill.id === current ? 'is-current' : ''}`}
                disabled={taken.includes(skill.id)}
                onClick={() => onPick(skill.id)}
              >
                <span className="skill-tier">T{skill.tier}</span>
                <span>
                  <strong>{skill.name}</strong>
                  <small>{skill.effect}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );

  return (
    <aside className="drawer" role="dialog" aria-label={`Skill ${index + 1}`}>
      <header className="drawer-header">
        <div>
          <p className="eyebrow">Skill slot {index + 1}</p>
          <h2>Choose a skill</h2>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <section className="drawer-browse">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search skills</span>
          <input autoFocus value={query} placeholder="Search name or effect, e.g. “defense”…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        {current && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick('')}>
            Clear this slot
          </button>
        )}
        {renderGroup(`${hero.name} skills`, classSkills)}
        {renderGroup('General skills', generalSkills)}
      </section>
    </aside>
  );
}

/** Keeps every item the new class can still wear in the same slot. */
function carryOverGear(
  build: BuildConfig,
  hero: HeroData,
  getItem: (id: string) => ItemData | undefined
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
