import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  GitCompare,
  Hammer,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import rawGameData from '../data/generated/game-data.json';
import { parseBuildJsonDetailed, serializeBuild, validateBuildConfig } from '../shared/build-io';
import {
  ITEM_QUALITIES,
  QUALITY_LABELS,
  baseHeroOptions,
  createId,
  defaultBuild,
  defaultRoster,
  emptyEquipmentForHero,
  getBaseHero,
  getEffectiveHero,
  getHero,
  getMaxTierForLevel,
  normalizeEquipmentForHero,
  slotLabel
} from '../shared/data-utils';
import { calculateHeroStats, getStarforgeStatMultiplier } from '../shared/engine';
import type {
  BuildConfig,
  ChampionData,
  EnchantmentData,
  EquipmentSelection,
  GameData,
  ItemData,
  ResolvedGearLine,
  RosterConfig,
  SkillData,
  StatBlock
} from '../shared/types';
import { ChampionToken, EnchantmentToken, HeroToken, ItemToken, SkillToken, VisualToken } from './VisualToken';

const data = rawGameData as GameData;
const CURRENT_BUILD_KEY = 'shopTitansHeroBuilder.currentBuild';
const SAVED_BUILDS_KEY = 'shopTitansHeroBuilder.savedBuilds';
const ROSTERS_KEY = 'shopTitansHeroBuilder.rosters';
const ACTIVE_ROSTER_KEY = 'shopTitansHeroBuilder.activeRoster';

type AppTab = 'builder' | 'roster' | 'compare' | 'items' | 'io';

const statLabels: Array<[keyof StatBlock, string]> = [
  ['attack', 'ATK'],
  ['defense', 'DEF'],
  ['hp', 'HP'],
  ['evasion', 'EVA'],
  ['critChance', 'CRIT'],
  ['critDamage', 'CDMG'],
  ['threat', 'Threat'],
  ['power', 'Power']
];

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('builder');
  const [build, setBuild] = useState<BuildConfig>(() => loadCurrentBuild());
  const [savedBuilds, setSavedBuilds] = useState<BuildConfig[]>(() => loadSavedBuilds());
  const [rosters, setRosters] = useState<RosterConfig[]>(() => loadRosters());
  const [activeRosterId, setActiveRosterId] = useState(() => window.localStorage.getItem(ACTIVE_ROSTER_KEY) ?? '');
  const [importText, setImportText] = useState('');
  const [ioMessage, setIoMessage] = useState('');

  const activeRoster = rosters.find((roster) => roster.id === activeRosterId) ?? rosters[0] ?? defaultRoster(data);
  const baseHero = getBaseHero(data, build.heroClassId) ?? baseHeroOptions(data)[0] ?? data.heroes[0];
  const effectiveHero = getEffectiveHero(data, baseHero?.id ?? build.heroClassId, build.promoted) ?? baseHero;
  const normalizedBuild = effectiveHero
    ? {
        ...build,
        heroClassId: baseHero?.id ?? build.heroClassId,
        championSkillId: build.championSkillId ?? '',
        equipment: normalizeEquipmentForHero(build, effectiveHero)
      }
    : build;
  const resolvedBuild = useMemo(() => calculateHeroStats(normalizedBuild, data), [normalizedBuild]);
  const validationWarnings = validateBuildConfig(normalizedBuild, data);

  useEffect(() => {
    window.localStorage.setItem(CURRENT_BUILD_KEY, serializeBuild(normalizedBuild));
  }, [normalizedBuild]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  useEffect(() => {
    window.localStorage.setItem(ROSTERS_KEY, JSON.stringify(rosters));
  }, [rosters]);

  useEffect(() => {
    if (activeRoster.id) {
      window.localStorage.setItem(ACTIVE_ROSTER_KEY, activeRoster.id);
    }
  }, [activeRoster.id]);

  function updateBuild(patch: Partial<BuildConfig>): void {
    setBuild((current) => ({ ...current, ...patch }));
  }

  function changeHero(heroClassId: string): void {
    const nextHero = getBaseHero(data, heroClassId);
    if (!nextHero) {
      return;
    }
    setBuild((current) => ({
      ...current,
      heroClassId: nextHero.id,
      promoted: false,
      equipment: emptyEquipmentForHero(nextHero)
    }));
  }

  function setPromoted(promoted: boolean): void {
    setBuild((current) => {
      const nextHero = getEffectiveHero(data, current.heroClassId, promoted) ?? getBaseHero(data, current.heroClassId);
      return {
        ...current,
        promoted,
        equipment: nextHero ? normalizeEquipmentForHero(current, nextHero) : current.equipment
      };
    });
  }

  function updateEquipment(slotId: string, patch: Partial<EquipmentSelection>): void {
    setBuild((current) => ({
      ...current,
      equipment: normalizeEquipmentForHero(current, effectiveHero).map((entry) =>
        entry.slotId === slotId ? { ...entry, ...patch } : entry
      )
    }));
  }

  function updateSkill(index: number, skillId: string): void {
    setBuild((current) => {
      const skills = [...current.skills];
      skills[index] = skillId;
      return { ...current, skills };
    });
  }

  function saveBuild(): void {
    const copy = { ...normalizedBuild, id: normalizedBuild.id || createId('build') };
    setSavedBuilds((current) => upsertBuild(current, copy));
    setIoMessage(`Saved "${copy.name}".`);
  }

  function duplicateBuild(): void {
    setBuild((current) => ({
      ...current,
      id: createId('build'),
      name: `${current.name} Copy`
    }));
  }

  function addCurrentToRoster(): void {
    const rosterBuild = {
      ...normalizedBuild,
      championSkillId: activeRoster.championSkillId,
      id: normalizedBuild.id || createId('build')
    };
    setRosters((current) =>
      current.map((roster) =>
        roster.id === activeRoster.id ? { ...roster, builds: upsertBuild(roster.builds, rosterBuild) } : roster
      )
    );
  }

  function createRoster(): void {
    const roster = { ...defaultRoster(data), name: `Roster ${rosters.length + 1}` };
    setRosters((current) => [...current, roster]);
    setActiveRosterId(roster.id);
  }

  function updateRoster(patch: Partial<RosterConfig>): void {
    setRosters((current) => current.map((roster) => (roster.id === activeRoster.id ? { ...roster, ...patch } : roster)));
  }

  function importBuild(): void {
    const result = parseBuildJsonDetailed(importText, data);
    if (!result.ok) {
      setIoMessage(result.errors.map((error) => `${error.field}: ${error.message}`).join('\n'));
      return;
    }
    setBuild(result.build);
    setIoMessage(
      result.warnings.length > 0
        ? result.warnings.map((warning) => `${warning.field}: ${warning.message}`).join('\n')
        : `Imported "${result.build.name}".`
    );
  }

  async function copyExport(): Promise<void> {
    await navigator.clipboard.writeText(serializeBuild(normalizedBuild));
    setIoMessage('Build JSON copied.');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Shop Titans</span>
          <h1>Hero Builder</h1>
        </div>
        <nav className="tabs" aria-label="Main views">
          <TabButton active={activeTab === 'builder'} onClick={() => setActiveTab('builder')} icon={<Hammer size={18} />}>
            Builder
          </TabButton>
          <TabButton active={activeTab === 'roster'} onClick={() => setActiveTab('roster')} icon={<UsersRound size={18} />}>
            Roster
          </TabButton>
          <TabButton active={activeTab === 'compare'} onClick={() => setActiveTab('compare')} icon={<GitCompare size={18} />}>
            Compare
          </TabButton>
          <TabButton active={activeTab === 'items'} onClick={() => setActiveTab('items')} icon={<Database size={18} />}>
            Items
          </TabButton>
          <TabButton active={activeTab === 'io'} onClick={() => setActiveTab('io')} icon={<ArrowDownToLine size={18} />}>
            JSON
          </TabButton>
        </nav>
      </header>

      {activeTab === 'builder' && (
        <main className="builder-grid">
          <section className="panel builder-panel">
            <div className="panel-title">
              <UserRound size={19} />
              <h2>Hero</h2>
            </div>
            <div className="field-grid">
              <label>
                Build name
                <input value={build.name} onChange={(event) => updateBuild({ name: event.target.value })} />
              </label>
              <label>
                Class
                <div className="select-with-token">
                  <HeroToken hero={baseHero} />
                  <select value={baseHero?.id ?? ''} onChange={(event) => changeHero(event.target.value)}>
                    {baseHeroOptions(data).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label>
                Level
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={build.level}
                  onChange={(event) => updateBuild({ level: clampNumber(event.target.valueAsNumber, 1, 50) })}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={build.promoted}
                  disabled={!baseHero?.promotedClassId}
                  onChange={(event) => setPromoted(event.target.checked)}
                />
                {baseHero?.promotedClassName || 'Promoted'}
              </label>
            </div>

            <div className="champion-row">
              <ChampionSkillSelect value={build.championSkillId ?? ''} onChange={(championSkillId) => updateBuild({ championSkillId })} />
            </div>

            <div className="hero-meta-row">
              <InfoChip label="Active class" value={effectiveHero?.name ?? 'Unknown'} kind="hero" />
              <InfoChip label="Innate" value={resolvedBuild.innateSkills.map((skill) => skill.name).join(', ') || 'None'} kind="skill" />
              <InfoChip label="Champion aura" value={resolvedBuild.championSkill?.name ?? 'None'} kind="champion" />
            </div>

            <div className="seed-row">
              <label>
                ATK seeds
                <input
                  type="number"
                  min={0}
                  value={build.seeds.attack}
                  onChange={(event) =>
                    updateBuild({ seeds: { ...build.seeds, attack: clampNumber(event.target.valueAsNumber, 0, 999) } })
                  }
                />
              </label>
              <label>
                DEF seeds
                <input
                  type="number"
                  min={0}
                  value={build.seeds.defense}
                  onChange={(event) =>
                    updateBuild({ seeds: { ...build.seeds, defense: clampNumber(event.target.valueAsNumber, 0, 999) } })
                  }
                />
              </label>
              <label>
                HP seeds
                <input
                  type="number"
                  min={0}
                  value={build.seeds.hp}
                  onChange={(event) =>
                    updateBuild({ seeds: { ...build.seeds, hp: clampNumber(event.target.valueAsNumber, 0, 999) } })
                  }
                />
              </label>
            </div>

            <section className="subsection">
              <h3>Skills</h3>
              <div className="skill-grid">
                {[0, 1, 2, 3].map((index) => {
                  const selectedSkill = data.skills.find((skill) => skill.id === (build.skills[index] ?? ''));
                  return (
                    <label key={index}>
                      Slot {index + 1}
                      <div className="select-with-token">
                        <SkillToken skill={selectedSkill} />
                        <select value={build.skills[index] ?? ''} onChange={(event) => updateSkill(index, event.target.value)}>
                          <option value="">Empty</option>
                          {skillOptions(effectiveHero).map((skill) => (
                            <option key={skill.id} value={skill.id}>
                              {skill.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="subsection">
              <h3>Gear</h3>
              <div className="gear-list">
                {effectiveHero.slots.map((slot) => {
                  const selection =
                    normalizedBuild.equipment.find((entry) => entry.slotId === slot.id) ?? emptyEquipmentForHero(effectiveHero)[0];
                  const line = resolvedBuild.gear.find((entry) => entry.slotId === slot.id);
                  return (
                    <GearRow
                      key={slot.id}
                      slotLabel={slotLabel(slot)}
                      allowedTypes={slot.allowedTypes}
                      selection={selection}
                      resolvedLine={line}
                      buildLevel={build.level}
                      onChange={(patch) => updateEquipment(slot.id, patch)}
                    />
                  );
                })}
              </div>
            </section>
          </section>

          <aside className="panel stat-panel">
            <div className="panel-title">
              <Sparkles size={19} />
              <h2>Stats</h2>
            </div>
            <StatGrid stats={resolvedBuild.stats} />
            <div className="action-row">
              <button type="button" className="primary-button" onClick={saveBuild}>
                <Save size={17} />
                Save Build
              </button>
              <button type="button" onClick={addCurrentToRoster}>
                <UsersRound size={17} />
                Add to Roster
              </button>
              <button type="button" onClick={duplicateBuild}>
                <Plus size={17} />
                Duplicate
              </button>
            </div>
            <SavedBuildList builds={savedBuilds} onLoad={setBuild} onDelete={setSavedBuilds} compact />
            <GearSummary lines={resolvedBuild.gear} />
            {[...resolvedBuild.warnings, ...validationWarnings.map((warning) => warning.message)].length > 0 && (
              <div className="warning-box">
                {[...resolvedBuild.warnings, ...validationWarnings.map((warning) => warning.message)].map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </aside>
        </main>
      )}

      {activeTab === 'roster' && (
        <RosterPanel
          activeRoster={activeRoster}
          rosters={rosters}
          savedBuilds={savedBuilds}
          onActiveRosterChange={setActiveRosterId}
          onCreateRoster={createRoster}
          onUpdateRoster={updateRoster}
          onLoadBuild={setBuild}
          onAddSavedBuild={(savedBuild) =>
            updateRoster({ builds: upsertBuild(activeRoster.builds, { ...savedBuild, championSkillId: activeRoster.championSkillId }) })
          }
          onRemoveBuild={(buildId) => updateRoster({ builds: activeRoster.builds.filter((entry) => entry.id !== buildId) })}
        />
      )}

      {activeTab === 'compare' && (
        <ComparePanel currentBuild={normalizedBuild} savedBuilds={savedBuilds} onLoad={setBuild} onDelete={setSavedBuilds} />
      )}

      {activeTab === 'items' && <ItemBrowser />}

      {activeTab === 'io' && (
        <JsonPanel
          exportText={serializeBuild(normalizedBuild)}
          importText={importText}
          message={ioMessage}
          onImportTextChange={setImportText}
          onImport={importBuild}
          onCopy={copyExport}
        />
      )}
    </div>
  );
}

interface GearRowProps {
  slotLabel: string;
  allowedTypes: string[];
  selection: EquipmentSelection;
  resolvedLine: ResolvedGearLine | undefined;
  buildLevel: number;
  onChange: (patch: Partial<EquipmentSelection>) => void;
}

function GearRow({ slotLabel, allowedTypes, selection, resolvedLine, buildLevel, onChange }: GearRowProps): JSX.Element {
  const maxTier = getMaxTierForLevel(data, buildLevel);
  const items = useMemo(
    () =>
      data.items
        .filter((item) => allowedTypes.includes(item.type) && item.tier <= maxTier)
        .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name)),
    [allowedTypes, maxTier]
  );
  const selectedItem = data.items.find((item) => item.id === selection.itemId);
  const selectedElement = data.enchantments.find((entry) => entry.id === selection.elementId);
  const selectedSpirit = data.enchantments.find((entry) => entry.id === selection.spiritId);
  const starforgeAvailable = selectedItem ? getStarforgeStatMultiplier(selectedItem) > 1 : false;

  return (
    <div className="gear-row">
      <label className="gear-item">
        {slotLabel}
        <div className="select-with-token">
          <ItemToken item={selectedItem} />
          <select value={selection.itemId} onChange={(event) => onChange({ itemId: event.target.value })}>
            <option value="">Empty</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                T{item.tier} {item.name}
              </option>
            ))}
          </select>
        </div>
      </label>
      <label>
        Quality
        <select value={selection.quality} onChange={(event) => onChange({ quality: event.target.value as EquipmentSelection['quality'] })}>
          {ITEM_QUALITIES.map((quality) => (
            <option key={quality} value={quality}>
              {QUALITY_LABELS[quality]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Element
        <div className="select-with-token">
          <EnchantmentToken enchantment={selectedElement} type="element" />
          <select value={selection.elementId} onChange={(event) => onChange({ elementId: event.target.value })}>
            <option value="">None</option>
            {data.enchantments
              .filter((entry) => entry.type === 'Element')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
        </div>
      </label>
      <label>
        Spirit
        <div className="select-with-token">
          <EnchantmentToken enchantment={selectedSpirit} type="spirit" />
          <select value={selection.spiritId} onChange={(event) => onChange({ spiritId: event.target.value })}>
            <option value="">None</option>
            {data.enchantments
              .filter((entry) => entry.type === 'Spirit')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
          </select>
        </div>
      </label>
      <label className="toggle-field" title={starforgeAvailable ? '+25% Base ATK, DEF and HP' : 'No stat milestone found'}>
        <input
          type="checkbox"
          checked={selection.starforged}
          disabled={!starforgeAvailable}
          onChange={(event) => onChange({ starforged: event.target.checked })}
        />
        <Sparkles size={16} />
      </label>
      {selectedItem && resolvedLine && (
        <div className="gear-details">
          <div className="gear-detail-title">
            <ItemToken item={selectedItem} />
            <strong>{selectedItem.name}</strong>
            <span>T{selectedItem.tier} {selectedItem.type}</span>
          </div>
          <div className="mini-stats">
            {itemStatEntries(resolvedLine.stats).map(([label, value]) => (
              <span key={label}>{label} {value}</span>
            ))}
          </div>
          <div className="source-row">
            {selectedItem.builtInElement && <span>Built-in: {selectedItem.builtInElement}</span>}
            {selectedItem.builtInSpirit && <span>Built-in: {selectedItem.builtInSpirit}</span>}
            {selectedItem.elementalAffinity && <span>Element affinity: {selectedItem.elementalAffinity}</span>}
            {selectedItem.spiritAffinity && <span>Spirit affinity: {selectedItem.spiritAffinity}</span>}
            {resolvedLine.affinityBonuses.map((bonus) => <span key={bonus}>{bonus}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterPanel({
  activeRoster,
  rosters,
  savedBuilds,
  onActiveRosterChange,
  onCreateRoster,
  onUpdateRoster,
  onLoadBuild,
  onAddSavedBuild,
  onRemoveBuild
}: {
  activeRoster: RosterConfig;
  rosters: RosterConfig[];
  savedBuilds: BuildConfig[];
  onActiveRosterChange: (id: string) => void;
  onCreateRoster: () => void;
  onUpdateRoster: (patch: Partial<RosterConfig>) => void;
  onLoadBuild: (build: BuildConfig) => void;
  onAddSavedBuild: (build: BuildConfig) => void;
  onRemoveBuild: (id: string) => void;
}): JSX.Element {
  const resolved = activeRoster.builds.map((build) =>
    calculateHeroStats({ ...build, championSkillId: activeRoster.championSkillId }, data)
  );
  const totals = resolved.reduce(
    (acc, entry) => ({
      attack: acc.attack + entry.stats.attack,
      defense: acc.defense + entry.stats.defense,
      hp: acc.hp + entry.stats.hp,
      evasion: acc.evasion + entry.stats.evasion,
      critChance: acc.critChance + entry.stats.critChance,
      critDamage: acc.critDamage + entry.stats.critDamage,
      threat: acc.threat + entry.stats.threat,
      power: acc.power + entry.stats.power
    }),
    { attack: 0, defense: 0, hp: 0, evasion: 0, critChance: 0, critDamage: 0, threat: 0, power: 0 }
  );

  return (
    <main className="roster-grid">
      <section className="panel builder-panel">
        <div className="panel-title">
          <UsersRound size={19} />
          <h2>Roster</h2>
        </div>
        <div className="roster-toolbar">
          <label>
            Active roster
            <select value={activeRoster.id} onChange={(event) => onActiveRosterChange(event.target.value)}>
              {rosters.map((roster) => (
                <option key={roster.id} value={roster.id}>
                  {roster.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Roster name
            <input value={activeRoster.name} onChange={(event) => onUpdateRoster({ name: event.target.value })} />
          </label>
          <button type="button" onClick={onCreateRoster}>
            <Plus size={17} />
            New Roster
          </button>
        </div>
        <ChampionSkillSelect
          value={activeRoster.championSkillId}
          onChange={(championSkillId) => onUpdateRoster({ championSkillId })}
        />
        <div className="saved-build-picker">
          <h3>Saved Builds</h3>
          <div className="saved-build-list">
            {savedBuilds.map((savedBuild) => (
              <button key={savedBuild.id} type="button" onClick={() => onAddSavedBuild(savedBuild)}>
                <HeroToken hero={getBaseHero(data, savedBuild.heroClassId)} />
                {savedBuild.name}
              </button>
            ))}
          </div>
        </div>
        <div className="roster-list">
          {resolved.map((entry) => (
            <article className="roster-card" key={entry.build.id}>
              <div>
                <HeroToken hero={entry.hero} />
                <div>
                  <strong>{entry.build.name}</strong>
                  <span>{entry.hero?.name ?? 'Unknown'}</span>
                </div>
              </div>
              <StatStrip stats={entry.stats} />
              <div className="roster-card-actions">
                <button type="button" onClick={() => onLoadBuild(entry.build)}>Load</button>
                <button type="button" className="icon-button" aria-label={`Remove ${entry.build.name}`} onClick={() => onRemoveBuild(entry.build.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="panel stat-panel">
        <div className="panel-title">
          <Sparkles size={19} />
          <h2>Team Totals</h2>
        </div>
        <StatGrid stats={totals} />
      </aside>
    </main>
  );
}

function ComparePanel({
  currentBuild,
  savedBuilds,
  onLoad,
  onDelete
}: {
  currentBuild: BuildConfig;
  savedBuilds: BuildConfig[];
  onLoad: (build: BuildConfig) => void;
  onDelete: (updater: (builds: BuildConfig[]) => BuildConfig[]) => void;
}): JSX.Element {
  const builds = savedBuilds.length > 0 ? savedBuilds : [currentBuild];
  const resolved = builds.map((entry) => calculateHeroStats(entry, data));
  const baseline = resolved[0]?.stats;

  return (
    <main className="panel wide-panel">
      <div className="panel-title">
        <GitCompare size={19} />
        <h2>Build Compare</h2>
      </div>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Build</th>
              {statLabels.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {resolved.map((entry) => (
              <tr key={entry.build.id}>
                <td>
                  <button type="button" className="link-button" onClick={() => onLoad(entry.build)}>
                    <HeroToken hero={entry.hero} />
                    {entry.build.name}
                  </button>
                </td>
                {statLabels.map(([key]) => (
                  <td key={key}>
                    {formatStat(key, entry.stats[key])}
                    {baseline && entry.stats[key] !== baseline[key] && (
                      <span className={entry.stats[key] > baseline[key] ? 'delta-up' : 'delta-down'}>
                        {entry.stats[key] > baseline[key] ? '+' : ''}
                        {formatStat(key, entry.stats[key] - baseline[key])}
                      </span>
                    )}
                  </td>
                ))}
                <td>
                  {savedBuilds.some((build) => build.id === entry.build.id) && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${entry.build.name}`}
                      onClick={() => onDelete((current) => current.filter((build) => build.id !== entry.build.id))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function ItemBrowser(): JSX.Element {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const types = useMemo(() => [...new Set(data.items.map((item) => item.type))].sort(), []);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.items
      .filter((item) => !type || item.type === type)
      .filter((item) => !normalizedQuery || `${item.name} ${item.type}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name))
      .slice(0, 120);
  }, [query, type]);

  return (
    <main className="panel wide-panel">
      <div className="panel-title">
        <Database size={19} />
        <h2>Item Database</h2>
      </div>
      <div className="browser-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" />
        </label>
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All types</option>
          {types.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>
      <div className="item-list">
        {filteredItems.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </div>
    </main>
  );
}

function ItemRow({ item }: { item: ItemData }): JSX.Element {
  const hasStatStarforge = getStarforgeStatMultiplier(item) > 1;
  return (
    <article className="item-row">
      <div className="item-title">
        <ItemToken item={item} />
        <div>
          <strong>{item.name}</strong>
          <span>
            T{item.tier} {item.type}
          </span>
        </div>
      </div>
      <div className="mini-stats">
        {itemStatEntries(item.stats).map(([label, value]) => (
          <span key={label}>{label} {value}</span>
        ))}
      </div>
      <div className="source-row compact">
        {item.builtInElement && <span>{item.builtInElement}</span>}
        {item.builtInSpirit && <span>{item.builtInSpirit}</span>}
        {item.elementalAffinity && <span>Element: {item.elementalAffinity}</span>}
        {item.spiritAffinity && <span>Spirit: {item.spiritAffinity}</span>}
      </div>
      {hasStatStarforge && (
        <span className="pill">
          <Sparkles size={14} />
          +25% Starforge
        </span>
      )}
    </article>
  );
}

function JsonPanel({
  exportText,
  importText,
  message,
  onImportTextChange,
  onImport,
  onCopy
}: {
  exportText: string;
  importText: string;
  message: string;
  onImportTextChange: (text: string) => void;
  onImport: () => void;
  onCopy: () => Promise<void>;
}): JSX.Element {
  return (
    <main className="io-grid">
      <section className="panel">
        <div className="panel-title">
          <ArrowUpFromLine size={19} />
          <h2>Export</h2>
        </div>
        <textarea readOnly value={exportText} />
        <button type="button" className="primary-button" onClick={onCopy}>
          <ArrowUpFromLine size={17} />
          Copy JSON
        </button>
      </section>
      <section className="panel">
        <div className="panel-title">
          <ArrowDownToLine size={19} />
          <h2>Import</h2>
        </div>
        <textarea value={importText} onChange={(event) => onImportTextChange(event.target.value)} />
        <button type="button" className="primary-button" onClick={onImport}>
          <ArrowDownToLine size={17} />
          Import JSON
        </button>
        {message && <pre className="io-message">{message}</pre>}
      </section>
    </main>
  );
}

function ChampionSkillSelect({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const skill = data.skills.find((entry) => entry.id === value);
  const champion = championForSkill(value);
  return (
    <label>
      Champion aura
      <div className="select-with-token">
        <ChampionToken champion={champion} />
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">None</option>
          {data.champions.map((entry) => (
            <optgroup key={entry.id} label={entry.name}>
              {entry.leaderSkillIds.map((skillId) => {
                const leaderSkill = data.skills.find((candidate) => candidate.id === skillId);
                return leaderSkill ? (
                  <option key={leaderSkill.id} value={leaderSkill.id}>
                    {leaderSkill.name}
                  </option>
                ) : null;
              })}
            </optgroup>
          ))}
        </select>
        {skill && <SkillToken skill={skill} />}
      </div>
    </label>
  );
}

function SavedBuildList({
  builds,
  onLoad,
  onDelete,
  compact = false
}: {
  builds: BuildConfig[];
  onLoad: (build: BuildConfig) => void;
  onDelete: (updater: (builds: BuildConfig[]) => BuildConfig[]) => void;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className={compact ? 'saved-build-list compact-list' : 'saved-build-list'}>
      <h3>Saved Builds</h3>
      {builds.length === 0 && <p className="muted">No saved builds yet.</p>}
      {builds.map((entry) => {
        const hero = getEffectiveHero(data, entry.heroClassId, entry.promoted);
        return (
          <div className="saved-build-row" key={entry.id}>
            <button type="button" onClick={() => onLoad(entry)}>
              <HeroToken hero={hero} />
              <span>{entry.name}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Delete ${entry.name}`}
              onClick={() => onDelete((current) => current.filter((build) => build.id !== entry.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function GearSummary({ lines }: { lines: ResolvedGearLine[] }): JSX.Element {
  return (
    <div className="gear-summary">
      {lines.map((line) => (
        <div className="summary-row" key={line.slotId}>
          <span>{line.slotLabel}</span>
          <strong>{line.itemName}</strong>
          {line.starforged && <em>Starforged</em>}
        </div>
      ))}
    </div>
  );
}

function StatGrid({ stats }: { stats: StatBlock }): JSX.Element {
  return (
    <div className="stat-grid">
      {statLabels.map(([key, label]) => (
        <div className="stat-tile" key={key}>
          <span>{label}</span>
          <strong>{formatStat(key, stats[key])}</strong>
        </div>
      ))}
    </div>
  );
}

function StatStrip({ stats }: { stats: StatBlock }): JSX.Element {
  return (
    <div className="stat-strip">
      <span>ATK {stats.attack.toLocaleString()}</span>
      <span>DEF {stats.defense.toLocaleString()}</span>
      <span>HP {stats.hp.toLocaleString()}</span>
      <span>PWR {stats.power.toLocaleString()}</span>
    </div>
  );
}

function InfoChip({ label, value, kind }: { label: string; value: string; kind: 'hero' | 'skill' | 'champion' }): JSX.Element {
  return (
    <div className="info-chip">
      <VisualToken kind={kind} label={value} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  children: string;
}): JSX.Element {
  return (
    <button type="button" className={active ? 'tab active' : 'tab'} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function skillOptions(hero: ReturnType<typeof getEffectiveHero>): SkillData[] {
  if (!hero) {
    return [];
  }
  return data.skills
    .filter((skill) => !['Leader', 'Innate'].includes(skill.type))
    .filter((skill) => skill.classes.length === 0 || skill.classes.some((entry) => skillClassMatches(entry, hero)))
    .slice(0, 300);
}

function skillClassMatches(classLabel: string, hero: NonNullable<ReturnType<typeof getEffectiveHero>>): boolean {
  const normalizedLabel = classLabel.toLowerCase();
  if (normalizedLabel.includes(hero.name.toLowerCase()) || normalizedLabel.includes(hero.baseClassName.toLowerCase())) {
    return true;
  }
  if (normalizedLabel.includes('all fighter') && hero.role === 'fighter') {
    return true;
  }
  if (normalizedLabel.includes('all rogue') && hero.role === 'rogue') {
    return true;
  }
  return normalizedLabel.includes('all spellcaster') && hero.role === 'spellcaster';
}

function championForSkill(skillId: string): ChampionData | undefined {
  return data.champions.find((champion) => champion.leaderSkillIds.includes(skillId));
}

function itemStatEntries(stats: { attack: number; defense: number; hp: number; evasion: number; critChance: number }): Array<[string, string]> {
  return [
    ['ATK', stats.attack, false],
    ['DEF', stats.defense, false],
    ['HP', stats.hp, false],
    ['EVA', stats.evasion, true],
    ['CRIT', stats.critChance, true]
  ]
    .filter(([, value]) => Number(value) > 0)
    .map(([label, value, isPercent]) => [
      String(label),
      `${Number(value).toLocaleString()}${isPercent ? '%' : ''}`
    ]) as Array<[string, string]>;
}

function upsertBuild(builds: BuildConfig[], build: BuildConfig): BuildConfig[] {
  const index = builds.findIndex((entry) => entry.id === build.id);
  if (index === -1) {
    return [...builds, build];
  }
  return builds.map((entry, entryIndex) => (entryIndex === index ? build : entry));
}

function loadCurrentBuild(): BuildConfig {
  const stored = window.localStorage.getItem(CURRENT_BUILD_KEY);
  if (!stored) {
    return defaultBuild(data);
  }
  const parsed = parseBuildJsonDetailed(stored, data);
  return parsed.ok ? { ...defaultBuild(data), ...parsed.build } : defaultBuild(data);
}

function loadSavedBuilds(): BuildConfig[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_BUILDS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => parseBuildJsonDetailed(JSON.stringify(entry), data).ok) as BuildConfig[];
  } catch {
    return [];
  }
}

function loadRosters(): RosterConfig[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROSTERS_KEY) ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RosterConfig[];
    }
  } catch {
    // Fall through to default roster.
  }
  return [defaultRoster(data)];
}

function formatStat(key: keyof StatBlock, value: number): string {
  if (key === 'evasion' || key === 'critChance') {
    return `${value.toLocaleString()}%`;
  }
  if (key === 'critDamage') {
    return `${value.toLocaleString()}x`;
  }
  return value.toLocaleString();
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
