import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Crown,
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
  defaultChampionBuild,
  defaultRoster,
  emptyEquipmentForHero,
  getBaseHero,
  getEffectiveHero,
  getMaxTierForLevel,
  normalizeEquipmentForHero,
  slotLabel
} from '../shared/data-utils';
import {
  calculateChampionBuildStats,
  calculateHeroStats,
  getChampionMaxRank,
  getStarforgeStatMultiplier,
  resolveChampion
} from '../shared/engine';
import type {
  BuildConfig,
  ChampionBuildConfig,
  ElementScores,
  EnchantmentData,
  EquipmentSelection,
  FlatStatModifiers,
  GameData,
  ItemData,
  PercentModifiers,
  ResolvedGearLine,
  ResolvedChampionBuild,
  RosterConfig,
  SkillData,
  StatBlock
} from '../shared/types';
import { ChampionToken, EnchantmentToken, HeroToken, ItemToken, SkillToken, VisualToken } from './VisualToken';

const data = rawGameData as GameData;
const CURRENT_BUILD_KEY = 'shopTitansHeroBuilder.currentBuild';
const HERO_BUILDS_KEY = 'shopTitansHeroBuilder.heroBuilds';
const CHAMPION_BUILD_KEY = 'shopTitansHeroBuilder.championBuild';
const SAVED_BUILDS_KEY = 'shopTitansHeroBuilder.savedBuilds';
const ROSTERS_KEY = 'shopTitansHeroBuilder.rosters';
const ACTIVE_ROSTER_KEY = 'shopTitansHeroBuilder.activeRoster';

const HERO_BUILD_COUNT = 5;
const heroTabs = [0, 1, 2, 3, 4] as const;

type HeroTab = `hero-${0 | 1 | 2 | 3 | 4}`;
type AppTab = HeroTab | 'champion' | 'roster' | 'compare' | 'items' | 'io';

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
  const [activeTab, setActiveTab] = useState<AppTab>('hero-0');
  const [heroBuilds, setHeroBuilds] = useState<BuildConfig[]>(() => loadHeroBuilds());
  const [championBuild, setChampionBuild] = useState<ChampionBuildConfig>(() => loadChampionBuild());
  const [savedBuilds, setSavedBuilds] = useState<BuildConfig[]>(() => loadSavedBuilds());
  const [rosters, setRosters] = useState<RosterConfig[]>(() => loadRosters());
  const [activeRosterId, setActiveRosterId] = useState(() => window.localStorage.getItem(ACTIVE_ROSTER_KEY) ?? '');
  const [importText, setImportText] = useState('');
  const [ioMessage, setIoMessage] = useState('');

  const activeHeroIndex = getActiveHeroIndex(activeTab);
  const build = heroBuilds[activeHeroIndex] ?? heroBuilds[0] ?? defaultBuild(data);
  const activeRoster = rosters.find((roster) => roster.id === activeRosterId) ?? rosters[0] ?? defaultRoster(data);
  const baseHero = getBaseHero(data, build.heroClassId) ?? baseHeroOptions(data)[0] ?? data.heroes[0];
  const effectiveHero = getEffectiveHero(data, baseHero?.id ?? build.heroClassId, build.promoted) ?? baseHero;
  const normalizedBuild = effectiveHero
    ? {
        ...build,
        heroClassId: baseHero?.id ?? build.heroClassId,
        equipment: normalizeEquipmentForHero(build, effectiveHero)
      }
    : build;
  const resolvedBuild = useMemo(() => calculateHeroStats(normalizedBuild, data), [normalizedBuild]);
  const resolvedChampionBuild = useMemo(() => calculateChampionBuildStats(championBuild, data), [championBuild]);
  const validationWarnings = validateBuildConfig(normalizedBuild, data);

  useEffect(() => {
    window.localStorage.setItem(CURRENT_BUILD_KEY, serializeBuild(normalizedBuild));
  }, [normalizedBuild]);

  useEffect(() => {
    window.localStorage.setItem(HERO_BUILDS_KEY, JSON.stringify(heroBuilds));
  }, [heroBuilds]);

  useEffect(() => {
    window.localStorage.setItem(CHAMPION_BUILD_KEY, JSON.stringify(championBuild));
  }, [championBuild]);

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

  function setActiveBuild(nextBuild: BuildConfig): void {
    setHeroBuilds((current) => replaceHeroBuild(current, activeHeroIndex, nextBuild));
    setActiveTab(`hero-${activeHeroIndex}` as HeroTab);
  }

  function updateActiveBuild(updater: (current: BuildConfig) => BuildConfig): void {
    setHeroBuilds((current) => {
      const normalized = ensureHeroBuildCount(current);
      const currentBuild = normalized[activeHeroIndex] ?? defaultBuild(data);
      return normalized.map((entry, index) => (index === activeHeroIndex ? updater(currentBuild) : entry));
    });
  }

  function updateBuild(patch: Partial<BuildConfig>): void {
    updateActiveBuild((current) => ({ ...current, ...patch }));
  }

  function changeHero(heroClassId: string): void {
    const nextHero = getBaseHero(data, heroClassId);
    if (!nextHero) {
      return;
    }
    updateActiveBuild((current) => ({
      ...current,
      heroClassId: nextHero.id,
      promoted: false,
      equipment: emptyEquipmentForHero(nextHero)
    }));
  }

  function setPromoted(promoted: boolean): void {
    updateActiveBuild((current) => {
      const nextHero = getEffectiveHero(data, current.heroClassId, promoted) ?? getBaseHero(data, current.heroClassId);
      return {
        ...current,
        promoted,
        equipment: nextHero ? normalizeEquipmentForHero(current, nextHero) : current.equipment
      };
    });
  }

  function updateEquipment(slotId: string, patch: Partial<EquipmentSelection>): void {
    updateActiveBuild((current) => {
      const hero = getEffectiveHero(data, current.heroClassId, current.promoted) ?? getBaseHero(data, current.heroClassId) ?? effectiveHero;
      return {
        ...current,
        equipment: hero
          ? normalizeEquipmentForHero(current, hero).map((entry) => (entry.slotId === slotId ? { ...entry, ...patch } : entry))
          : current.equipment
      };
    });
  }

  function updateSkill(index: number, skillId: string): void {
    updateActiveBuild((current) => {
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

  function saveBuildAsNew(): void {
    const copy = {
      ...normalizedBuild,
      id: createId('build'),
      name: `${normalizedBuild.name} Copy`
    };
    setSavedBuilds((current) => [...current, copy]);
    setActiveBuild(copy);
    setIoMessage(`Saved "${copy.name}".`);
  }

  function duplicateBuild(): void {
    updateActiveBuild((current) => ({
      ...current,
      id: createId('build'),
      name: `${current.name} Copy`
    }));
  }

  function addCurrentToRoster(): void {
    const rosterBuild = {
      ...normalizedBuild,
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

  function duplicateRoster(): void {
    const roster = {
      ...activeRoster,
      id: createId('roster'),
      name: `${activeRoster.name} Copy`,
      builds: activeRoster.builds.map((entry) => ({ ...entry }))
    };
    setRosters((current) => [...current, roster]);
    setActiveRosterId(roster.id);
  }

  function deleteActiveRoster(): void {
    if (rosters.length <= 1) {
      return;
    }
    const remaining = rosters.filter((roster) => roster.id !== activeRoster.id);
    setRosters(remaining);
    setActiveRosterId(remaining[0]?.id ?? '');
  }

  function updateRoster(patch: Partial<RosterConfig>): void {
    setRosters((current) => current.map((roster) => (roster.id === activeRoster.id ? { ...roster, ...patch } : roster)));
  }

  function updateChampionBuild(patch: Partial<ChampionBuildConfig>): void {
    setChampionBuild((current) => normalizeChampionBuild({ ...current, ...patch }) ?? defaultChampionBuild(data));
  }

  function changeChampion(championId: string): void {
    const champion = data.champions.find((entry) => entry.id === championId);
    setChampionBuild((current) =>
      normalizeChampionBuild({
        ...current,
        championId,
        rank: champion ? getChampionMaxRank(champion) : 1,
        powerUps: 0
      }) ?? defaultChampionBuild(data)
    );
  }

  function updateChampionEquipment(slot: 'familiar' | 'aurasong', patch: Partial<EquipmentSelection>): void {
    setChampionBuild((current) =>
      normalizeChampionBuild({
        ...current,
        [slot]: {
          ...current[slot],
          ...patch
        }
      }) ?? current
    );
  }

  function useChampionBuildInRoster(): void {
    updateRoster({
      championId: championBuild.championId,
      championRank: championBuild.rank,
      championPowerUps: championBuild.powerUps
    });
  }

  function importBuild(): void {
    const result = parseBuildJsonDetailed(importText, data);
    if (!result.ok) {
      setIoMessage(result.errors.map((error) => `${error.field}: ${error.message}`).join('\n'));
      return;
    }
    setActiveBuild(result.build);
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
          {heroTabs.map((index) => {
            const tab = `hero-${index}` as HeroTab;
            return (
              <TabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)} icon={<Hammer size={18} />}>
                {`Hero ${index + 1}`}
              </TabButton>
            );
          })}
          <TabButton active={activeTab === 'champion'} onClick={() => setActiveTab('champion')} icon={<Crown size={18} />}>
            Champion
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

      {isHeroTab(activeTab) && (
        <main className="builder-grid">
          <section className="panel builder-panel">
            <div className="panel-title">
              <UserRound size={19} />
              <h2>Hero {activeHeroIndex + 1}</h2>
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

            <div className="hero-meta-row">
              <InfoChip label="Active class" value={effectiveHero?.name ?? 'Unknown'} kind="hero" />
              <InfoChip label="Innate" value={resolvedBuild.innateSkills.map((skill) => skill.name).join(', ') || 'None'} kind="skill" />
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
            <div className="storage-panel">
              <div className="storage-panel-head">
                <h3>Build Storage</h3>
                <span>{savedBuilds.length} saved · {activeRoster.name}</span>
              </div>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={saveBuild}>
                <Save size={17} />
                Save Build
              </button>
                <button type="button" onClick={saveBuildAsNew}>
                  <Save size={17} />
                  Save Copy
                </button>
              <button type="button" onClick={addCurrentToRoster}>
                <UsersRound size={17} />
                Add to {activeRoster.name}
              </button>
                <button type="button" onClick={duplicateBuild}>
                  <Plus size={17} />
                  New Draft
                </button>
              </div>
            </div>
            <ElementPointsPanel scores={resolvedBuild.elementScores} />
            <SavedBuildList
              builds={savedBuilds}
              onLoad={setActiveBuild}
              onDelete={setSavedBuilds}
              onAddToRoster={(savedBuild) => updateRoster({ builds: upsertBuild(activeRoster.builds, savedBuild) })}
              rosterName={activeRoster.name}
              compact
            />
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
          onDuplicateRoster={duplicateRoster}
          onDeleteRoster={deleteActiveRoster}
          onUpdateRoster={updateRoster}
          onLoadBuild={setActiveBuild}
          onAddSavedBuild={(savedBuild) => updateRoster({ builds: upsertBuild(activeRoster.builds, savedBuild) })}
          onDeleteSavedBuild={setSavedBuilds}
          onRemoveBuild={(buildId) => updateRoster({ builds: activeRoster.builds.filter((entry) => entry.id !== buildId) })}
        />
      )}

      {activeTab === 'compare' && (
        <ComparePanel currentBuild={normalizedBuild} savedBuilds={savedBuilds} onLoad={setActiveBuild} onDelete={setSavedBuilds} />
      )}

      {activeTab === 'items' && <ItemBrowser />}

      {activeTab === 'champion' && (
        <ChampionBuildPanel
          build={championBuild}
          resolved={resolvedChampionBuild}
          activeRoster={activeRoster}
          onChange={updateChampionBuild}
          onChangeChampion={changeChampion}
          onChangeEquipment={updateChampionEquipment}
          onUseInRoster={useChampionBuildInRoster}
        />
      )}

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
  const builtInElement = selectedItem ? findBuiltInEnchantment(selectedItem.builtInElement, 'Element') : undefined;
  const builtInSpirit = selectedItem ? findBuiltInEnchantment(selectedItem.builtInSpirit, 'Spirit') : undefined;
  const elementLocked = Boolean(selectedItem?.builtInElement);
  const spiritLocked = Boolean(selectedItem?.builtInSpirit);
  const selectedElement = builtInElement ?? data.enchantments.find((entry) => entry.id === selection.elementId);
  const selectedSpirit = builtInSpirit ?? data.enchantments.find((entry) => entry.id === selection.spiritId);
  const elementSelectValue = builtInElement?.id ?? (elementLocked ? '__built-in-element' : selection.elementId);
  const spiritSelectValue = builtInSpirit?.id ?? (spiritLocked ? '__built-in-spirit' : selection.spiritId);
  const starforgeAvailable = selectedItem ? getStarforgeStatMultiplier(selectedItem) > 1 : false;
  const spiritEffectStats = resolvedLine ? spiritEffectEntries(resolvedLine.spiritModifiers, resolvedLine.spiritFlatStats) : [];

  function handleItemChange(itemId: string): void {
    const nextItem = data.items.find((item) => item.id === itemId);
    onChange({
      itemId,
      elementId: !nextItem || nextItem.builtInElement ? '' : selection.elementId,
      spiritId: !nextItem || nextItem.builtInSpirit ? '' : selection.spiritId,
      starforged: nextItem && getStarforgeStatMultiplier(nextItem) > 1 ? selection.starforged : false
    });
  }

  return (
    <div className="gear-row">
      <label className="gear-item">
        {slotLabel}
        <div className="select-with-token">
          <ItemToken item={selectedItem} />
          <select value={selection.itemId} onChange={(event) => handleItemChange(event.target.value)}>
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
          <select
            value={elementSelectValue}
            disabled={elementLocked}
            onChange={(event) => onChange({ elementId: event.target.value })}
          >
            <option value="">None</option>
            {elementLocked && !builtInElement && <option value="__built-in-element">{selectedItem?.builtInElement}</option>}
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
          <select
            value={spiritSelectValue}
            disabled={spiritLocked}
            onChange={(event) => onChange({ spiritId: event.target.value })}
          >
            <option value="">None</option>
            {spiritLocked && !builtInSpirit && <option value="__built-in-spirit">{selectedItem?.builtInSpirit}</option>}
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
          {spiritEffectStats.length > 0 && (
            <div className="mini-stats effect-stats">
              {spiritEffectStats.map(([label, value]) => (
                <span key={label}>Spirit {value} {label}</span>
              ))}
            </div>
          )}
          <ElementPointStrip scores={resolvedLine.elementScores} />
          <div className="source-row">
            {resolvedLine.elementSources.map((source) => <span key={`element-${source}`}>Element: {source}</span>)}
            {resolvedLine.spiritSources.map((source) => <span key={`spirit-${source}`}>Spirit: {source}</span>)}
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
  onDuplicateRoster,
  onDeleteRoster,
  onUpdateRoster,
  onLoadBuild,
  onAddSavedBuild,
  onDeleteSavedBuild,
  onRemoveBuild
}: {
  activeRoster: RosterConfig;
  rosters: RosterConfig[];
  savedBuilds: BuildConfig[];
  onActiveRosterChange: (id: string) => void;
  onCreateRoster: () => void;
  onDuplicateRoster: () => void;
  onDeleteRoster: () => void;
  onUpdateRoster: (patch: Partial<RosterConfig>) => void;
  onLoadBuild: (build: BuildConfig) => void;
  onAddSavedBuild: (build: BuildConfig) => void;
  onDeleteSavedBuild: (updater: (builds: BuildConfig[]) => BuildConfig[]) => void;
  onRemoveBuild: (id: string) => void;
}): JSX.Element {
  const activeChampion = data.champions.find((champion) => champion.id === activeRoster.championId) ?? data.champions[0];
  const resolvedChampion = activeChampion
    ? resolveChampion(activeChampion, data, activeRoster.championRank, activeRoster.championPowerUps)
    : null;
  const resolved = activeRoster.builds.map((build) =>
    calculateHeroStats(build, data, { championSkillId: resolvedChampion?.leaderSkill?.id })
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
  const totalElementScores = resolved.reduce((acc, entry) => mergeElementScores(acc, entry.elementScores), {} as ElementScores);
  const rosterSummaries = rosters.map((roster) => {
    const rosterChampion = data.champions.find((champion) => champion.id === roster.championId) ?? data.champions[0];
    const rosterChampionResolved = rosterChampion
      ? resolveChampion(rosterChampion, data, roster.championRank, roster.championPowerUps)
      : null;
    const rosterPower = roster.builds
      .map((build) => calculateHeroStats(build, data, { championSkillId: rosterChampionResolved?.leaderSkill?.id }))
      .reduce((total, entry) => total + entry.stats.power, 0);
    return {
      roster,
      championName: rosterChampion?.name ?? 'None',
      heroCount: roster.builds.length,
      power: rosterPower
    };
  });

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
          <div className="roster-actions">
            <button type="button" onClick={onDuplicateRoster}>
              <Plus size={17} />
              Duplicate
            </button>
            <button type="button" disabled={rosters.length <= 1} onClick={onDeleteRoster}>
              <Trash2 size={17} />
              Delete
            </button>
          </div>
        </div>
        <div className="roster-save-state">
          <Save size={15} />
          <span>{rosters.length} saved roster{rosters.length === 1 ? '' : 's'} · autosaved locally</span>
        </div>
        <div className="saved-roster-grid">
          {rosterSummaries.map((summary) => (
            <button
              key={summary.roster.id}
              type="button"
              className={summary.roster.id === activeRoster.id ? 'saved-roster-card active' : 'saved-roster-card'}
              onClick={() => onActiveRosterChange(summary.roster.id)}
            >
              <strong>{summary.roster.name}</strong>
              <span>{summary.heroCount} heroes</span>
              <span>{summary.championName}</span>
              <span>PWR {summary.power.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <ChampionRosterControls activeRoster={activeRoster} onUpdateRoster={onUpdateRoster} />
        <div className="roster-aura-note">
          <ChampionToken champion={activeChampion} />
          <span>
            {resolvedChampion?.leaderSkill
              ? `${activeChampion?.name ?? 'Champion'} rank ${resolvedChampion.rank} affects every build in this roster with ${resolvedChampion.leaderSkill.name}.`
              : 'No champion aura is active for this roster.'}
          </span>
        </div>
        <div className="roster-overview">
          <div>
            <span>Heroes</span>
            <strong>{resolved.length}</strong>
          </div>
          <div>
            <span>Champion</span>
            <strong>{activeChampion?.name ?? 'None'}</strong>
          </div>
          <div>
            <span>Team Power</span>
            <strong>{totals.power.toLocaleString()}</strong>
          </div>
        </div>
        <div className="saved-build-picker">
          <SavedBuildList
            builds={savedBuilds}
            onLoad={onLoadBuild}
            onDelete={onDeleteSavedBuild}
            onAddToRoster={onAddSavedBuild}
            rosterName={activeRoster.name}
          />
        </div>
        <div className="roster-list">
          {resolved.length === 0 && <p className="muted">No heroes in this roster yet.</p>}
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
              <ElementPointStrip scores={entry.elementScores} compact />
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
        <ElementPointsPanel scores={totalElementScores} />
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

function ChampionBuildPanel({
  build,
  resolved,
  activeRoster,
  onChange,
  onChangeChampion,
  onChangeEquipment,
  onUseInRoster
}: {
  build: ChampionBuildConfig;
  resolved: ResolvedChampionBuild;
  activeRoster: RosterConfig;
  onChange: (patch: Partial<ChampionBuildConfig>) => void;
  onChangeChampion: (championId: string) => void;
  onChangeEquipment: (slot: 'familiar' | 'aurasong', patch: Partial<EquipmentSelection>) => void;
  onUseInRoster: () => void;
}): JSX.Element {
  const champion = resolved.champion ?? data.champions.find((entry) => entry.id === build.championId) ?? data.champions[0];
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  const rankResolved = champion ? resolveChampion(champion, data, build.rank, build.powerUps) : null;
  const isRosterChampion = activeRoster.championId === build.championId;

  return (
    <main className="builder-grid champion-builder-grid">
      <section className="panel builder-panel">
        <div className="panel-title">
          <Crown size={19} />
          <h2>Champion</h2>
        </div>
        <div className="field-grid champion-field-grid">
          <label>
            Build name
            <input value={build.name} onChange={(event) => onChange({ name: event.target.value })} />
          </label>
          <label>
            Champion
            <div className="select-with-token">
              <ChampionToken champion={champion} />
              <select value={champion?.id ?? ''} onChange={(event) => onChangeChampion(event.target.value)}>
                {data.champions.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label>
            Rank
            <input
              type="number"
              min={1}
              max={maxRank}
              value={build.rank}
              onChange={(event) => onChange({ rank: clampNumber(event.target.valueAsNumber, 1, maxRank) })}
            />
          </label>
          <label>
            Level
            <input
              type="number"
              min={1}
              max={50}
              value={build.level}
              onChange={(event) => onChange({ level: clampNumber(event.target.valueAsNumber, 1, 50) })}
            />
          </label>
          <label>
            +X power-ups
            <input
              type="number"
              min={0}
              value={build.powerUps}
              onChange={(event) => onChange({ powerUps: clampNumber(event.target.valueAsNumber, 0, 999) })}
            />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={build.championSoul}
              onChange={(event) => onChange({ championSoul: event.target.checked })}
            />
            Champion Soul
          </label>
        </div>

        <div className="hero-meta-row">
          <InfoChip label="Active champion" value={champion?.name ?? 'Unknown'} kind="champion" />
          <InfoChip label="Aura" value={resolved.leaderSkill?.name ?? 'None'} kind="skill" />
        </div>

        <div className="champion-meta champion-builder-meta">
          <span>{champion?.guest ? 'Guest champion' : 'Champion'}</span>
          <span>{champion?.role ?? 'unknown'}</span>
          <span>{champion?.element || 'No element'}</span>
          <span>Max rank {maxRank}</span>
          <span>{build.championSoul ? 'Soul active' : 'No Soul'}</span>
        </div>

        <div className="seed-row champion-seeds">
          <label>
            ATK seeds
            <input
              type="number"
              min={0}
              value={build.seeds.attack}
              onChange={(event) =>
                onChange({ seeds: { ...build.seeds, attack: clampNumber(event.target.valueAsNumber, 0, 999) } })
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
                onChange({ seeds: { ...build.seeds, defense: clampNumber(event.target.valueAsNumber, 0, 999) } })
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
                onChange({ seeds: { ...build.seeds, hp: clampNumber(event.target.valueAsNumber, 0, 999) } })
              }
            />
          </label>
        </div>

        <section className="subsection">
          <h3>Champion Gear</h3>
          <div className="gear-list">
            <GearRow
              slotLabel="Familiar"
              allowedTypes={['Familiar']}
              selection={build.familiar}
              resolvedLine={resolved.gear.find((entry) => entry.slotId === 'familiar')}
              buildLevel={build.level}
              onChange={(patch) => onChangeEquipment('familiar', patch)}
            />
            <GearRow
              slotLabel="Aurasong"
              allowedTypes={['Aurasong']}
              selection={build.aurasong}
              resolvedLine={resolved.gear.find((entry) => entry.slotId === 'aurasong')}
              buildLevel={build.level}
              onChange={(patch) => onChangeEquipment('aurasong', patch)}
            />
          </div>
        </section>
      </section>

      <aside className="panel stat-panel">
        <div className="panel-title">
          <Sparkles size={19} />
          <h2>Champion Stats</h2>
        </div>
        <StatGrid stats={resolved.stats} />
        <ElementPointsPanel scores={resolved.elementScores} />
        <div className="action-row">
          <button type="button" className={isRosterChampion ? 'primary-button' : undefined} onClick={onUseInRoster}>
            <UsersRound size={17} />
            Set for {activeRoster.name}
          </button>
        </div>
        <div className="champion-section-label">Base at rank {rankResolved?.rank ?? build.rank}</div>
        <div className="champion-base-stats">
          {championBaseStatEntries(rankResolved?.stats ?? resolved.stats).map(([label, value]) => (
            <span key={label}>
              {label} <strong>{value}</strong>
            </span>
          ))}
        </div>
        <div className="active-aura-chip champion-aura-chip">
          <SkillToken skill={resolved.leaderSkill ?? undefined} />
          <span>Champion aura</span>
          <strong>{resolved.leaderSkill?.name ?? 'None'}</strong>
        </div>
        <div className="champion-build-summary">
          <span>Rank <strong>{build.rank}</strong></span>
          <span>Level <strong>{build.level}</strong></span>
          <span>Power-ups <strong>{build.powerUps}</strong></span>
          <span>Soul <strong>{build.championSoul ? 'On' : 'Off'}</strong></span>
        </div>
        <GearSummary lines={resolved.gear} />
        {resolved.warnings.length > 0 && (
          <div className="warning-box">
            {resolved.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </aside>
    </main>
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

function ChampionRosterControls({
  activeRoster,
  onUpdateRoster
}: {
  activeRoster: RosterConfig;
  onUpdateRoster: (patch: Partial<RosterConfig>) => void;
}): JSX.Element {
  const champion = data.champions.find((entry) => entry.id === activeRoster.championId) ?? data.champions[0];
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  const resolved = champion ? resolveChampion(champion, data, activeRoster.championRank, activeRoster.championPowerUps) : null;
  return (
    <div className="champion-controls">
      <label>
        Roster champion
        <div className="select-with-token">
          <ChampionToken champion={champion} />
          <select
            value={champion?.id ?? ''}
            onChange={(event) => {
              const nextChampion = data.champions.find((entry) => entry.id === event.target.value);
              onUpdateRoster({
                championId: event.target.value,
                championRank: nextChampion ? getChampionMaxRank(nextChampion) : 1,
                championPowerUps: 0
              });
            }}
          >
            {data.champions.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      </label>
      <label>
        Rank
        <input
          type="number"
          min={1}
          max={maxRank}
          value={resolved?.rank ?? 1}
          onChange={(event) => onUpdateRoster({ championRank: clampNumber(event.target.valueAsNumber, 1, maxRank) })}
        />
      </label>
      <label>
        +X power-ups
        <input
          type="number"
          min={0}
          value={activeRoster.championPowerUps}
          onChange={(event) => onUpdateRoster({ championPowerUps: clampNumber(event.target.valueAsNumber, 0, 999) })}
        />
      </label>
      <div className="active-aura-chip">
        <SkillToken skill={resolved?.leaderSkill ?? undefined} />
        <span>Champion aura</span>
        <strong>{resolved?.leaderSkill?.name ?? 'None'}</strong>
      </div>
    </div>
  );
}

function SavedBuildList({
  builds,
  onLoad,
  onDelete,
  onAddToRoster,
  rosterName,
  compact = false
}: {
  builds: BuildConfig[];
  onLoad: (build: BuildConfig) => void;
  onDelete: (updater: (builds: BuildConfig[]) => BuildConfig[]) => void;
  onAddToRoster?: (build: BuildConfig) => void;
  rosterName?: string;
  compact?: boolean;
}): JSX.Element {
  return (
    <div className={compact ? 'saved-build-list compact-list' : 'saved-build-list'}>
      <div className="saved-build-head">
        <h3>Saved Builds</h3>
        <span>{builds.length}</span>
      </div>
      {builds.length === 0 && <p className="muted">No saved builds yet.</p>}
      {builds.map((entry) => {
        const hero = getEffectiveHero(data, entry.heroClassId, entry.promoted);
        const resolved = calculateHeroStats(entry, data);
        return (
          <div className="saved-build-row" key={entry.id}>
            <button type="button" className="saved-build-main" onClick={() => onLoad(entry)}>
              <HeroToken hero={hero} />
              <span>
                <strong>{entry.name}</strong>
                <small>
                  {hero?.name ?? 'Unknown'} | Lv {entry.level} | PWR {resolved.stats.power.toLocaleString()}
                </small>
              </span>
            </button>
            <div className="saved-build-actions">
              <button type="button" onClick={() => onLoad(entry)}>Load</button>
              {onAddToRoster && (
                <button type="button" onClick={() => onAddToRoster(entry)}>
                  <UsersRound size={15} />
                  {rosterName ? `Add` : 'Add'}
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete ${entry.name}`}
                onClick={() => onDelete((current) => current.filter((build) => build.id !== entry.id))}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {rosterName && onAddToRoster && (
              <span className="saved-build-target">Roster: {rosterName}</span>
            )}
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
          <div className="summary-enchants">
            <span>Element {gearSourceLabel(line.elementSources)}</span>
            <span>Spirit {gearSourceLabel(line.spiritSources)}</span>
          </div>
          {line.starforged && <em>Starforged</em>}
        </div>
      ))}
    </div>
  );
}

function gearSourceLabel(sources: string[]): string {
  return sources[0]?.replace(/\s+built-in$/i, '') || 'None';
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

function ElementPointsPanel({ scores }: { scores: ElementScores }): JSX.Element {
  const entries = elementScoreEntries(scores);
  return (
    <div className="element-points-panel">
      <h3>Element Points</h3>
      {entries.length === 0 ? (
        <p className="muted">No element points.</p>
      ) : (
        <div className="element-point-grid">
          {entries.map(([key, value]) => (
            <span key={key}>
              {formatElementLabel(key)}
              <strong>{value}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ElementPointStrip({ scores, compact = false }: { scores: ElementScores; compact?: boolean }): JSX.Element | null {
  const entries = elementScoreEntries(scores);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className={compact ? 'element-point-strip compact' : 'element-point-strip'}>
      {entries.map(([key, value]) => (
        <span key={key}>{formatElementLabel(key)} {value}</span>
      ))}
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

function championBaseStatEntries(stats: StatBlock): Array<[string, string]> {
  return [
    ['ATK', stats.attack.toLocaleString()],
    ['DEF', stats.defense.toLocaleString()],
    ['HP', stats.hp.toLocaleString()],
    ['EVA', `${stats.evasion.toLocaleString()}%`],
    ['CRIT', `${stats.critChance.toLocaleString()}%`],
    ['Threat', stats.threat.toLocaleString()]
  ];
}

function itemStatEntries(stats: { attack: number; defense: number; hp: number; evasion: number; critChance: number }): Array<[string, string]> {
  return [
    ['ATK', stats.attack, false],
    ['DEF', stats.defense, false],
    ['HP', stats.hp, false],
    ['EVA', normalizeDisplayPercentStat(stats.evasion), true],
    ['CRIT', normalizeDisplayPercentStat(stats.critChance), true]
  ]
    .filter(([, value]) => Number(value) > 0)
    .map(([label, value, isPercent]) => [
      String(label),
      `${Number(value).toLocaleString()}${isPercent ? '%' : ''}`
    ]) as Array<[string, string]>;
}

function spiritEffectEntries(modifiers: PercentModifiers, flatStats: FlatStatModifiers): Array<[string, string]> {
  const percentEntries: Array<[keyof PercentModifiers, string]> = [
    ['attack', 'ATK'],
    ['defense', 'DEF'],
    ['hp', 'HP'],
    ['evasion', 'EVA'],
    ['critChance', 'CRIT'],
    ['critDamage', 'CDMG']
  ];
  const flatEntries: Array<[keyof FlatStatModifiers, string, boolean]> = [
    ['attack', 'ATK', false],
    ['defense', 'DEF', false],
    ['hp', 'HP', false],
    ['evasion', 'EVA', true],
    ['critChance', 'CRIT', true],
    ['critDamage', 'CDMG', true],
    ['threat', 'Threat', false]
  ];

  return [
    ...percentEntries
      .filter(([key]) => modifiers[key] > 0)
      .map(([key, label]) => [label, formatPercentBonus(modifiers[key] * 100)] as [string, string]),
    ...flatEntries
      .filter(([key]) => flatStats[key] > 0)
      .map(([key, label, isPercent]) => [
        label,
        isPercent ? formatPercentBonus(flatStats[key]) : `+${flatStats[key].toLocaleString()}`
      ] as [string, string])
  ];
}

function formatPercentBonus(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `+${rounded.toLocaleString()}%`;
}

function findBuiltInEnchantment(name: string, type: 'Element' | 'Spirit'): EnchantmentData | undefined {
  const normalizedName = normalizeEnchantmentName(name);
  if (!normalizedName) {
    return undefined;
  }
  return data.enchantments.find(
    (entry) => entry.type === type && normalizeEnchantmentName(entry.name) === normalizedName
  );
}

function normalizeEnchantmentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/\(.+?\)/g, '')
    .replace(/\b(element|spirit)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function elementScoreEntries(scores: ElementScores): Array<[string, number]> {
  const order = ['fire', 'water', 'air', 'earth', 'light', 'dark', 'luxurious', 'gold', 'all'];
  return Object.entries(scores)
    .filter(([, value]) => value > 0)
    .sort((left, right) => {
      const leftIndex = order.indexOf(left[0]);
      const rightIndex = order.indexOf(right[0]);
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      }
      return left[0].localeCompare(right[0]);
    });
}

function formatElementLabel(key: string): string {
  const labels: Record<string, string> = {
    fire: 'Fire',
    water: 'Water',
    air: 'Air',
    earth: 'Earth',
    light: 'Light',
    dark: 'Dark',
    luxurious: 'Gold',
    gold: 'Gold',
    all: 'All'
  };
  return labels[key] ?? key;
}

function mergeElementScores(left: ElementScores, right: ElementScores): ElementScores {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

function normalizeDisplayPercentStat(value: number): number {
  return value > 0 && value < 1 ? Math.round(value * 10000) / 100 : value;
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

function loadHeroBuilds(): BuildConfig[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HERO_BUILDS_KEY) ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return ensureHeroBuildCount(parsed.filter((entry) => parseBuildJsonDetailed(JSON.stringify(entry), data).ok) as BuildConfig[]);
    }
  } catch {
    // Fall through to the current-build migration.
  }
  const defaults = createDefaultHeroBuilds();
  return replaceHeroBuild(defaults, 0, loadCurrentBuild());
}

function createDefaultHeroBuilds(): BuildConfig[] {
  return Array.from({ length: HERO_BUILD_COUNT }, (_, index) => ({
    ...defaultBuild(data),
    name: `Hero ${index + 1}`
  }));
}

function ensureHeroBuildCount(builds: BuildConfig[]): BuildConfig[] {
  const defaults = createDefaultHeroBuilds();
  return defaults.map((fallback, index) => {
    const candidate = builds[index];
    if (!candidate) {
      return fallback;
    }
    const parsed = parseBuildJsonDetailed(JSON.stringify(candidate), data);
    return parsed.ok ? { ...fallback, ...parsed.build } : fallback;
  });
}

function replaceHeroBuild(builds: BuildConfig[], index: number, build: BuildConfig): BuildConfig[] {
  const normalized = ensureHeroBuildCount(builds);
  return normalized.map((entry, entryIndex) => (entryIndex === index ? build : entry));
}

function loadChampionBuild(): ChampionBuildConfig {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHAMPION_BUILD_KEY) ?? 'null');
    return normalizeChampionBuild(parsed) ?? defaultChampionBuild(data);
  } catch {
    return defaultChampionBuild(data);
  }
}

function normalizeChampionBuild(value: unknown): ChampionBuildConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const fallback = defaultChampionBuild(data);
  const candidate = value as Partial<ChampionBuildConfig>;
  const champion = data.champions.find((entry) => entry.id === candidate.championId) ?? data.champions[0];
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  return {
    schemaVersion: 1,
    id: typeof candidate.id === 'string' ? candidate.id : fallback.id,
    name: typeof candidate.name === 'string' ? candidate.name : fallback.name,
    championId: champion?.id ?? fallback.championId,
    rank: clampNumber(Number(candidate.rank ?? fallback.rank), 1, maxRank),
    level: clampNumber(Number(candidate.level ?? fallback.level), 1, 50),
    powerUps: clampNumber(Number(candidate.powerUps ?? fallback.powerUps), 0, 999),
    championSoul: Boolean(candidate.championSoul ?? fallback.championSoul),
    seeds: {
      attack: clampNumber(Number(candidate.seeds?.attack ?? fallback.seeds.attack), 0, 999),
      defense: clampNumber(Number(candidate.seeds?.defense ?? fallback.seeds.defense), 0, 999),
      hp: clampNumber(Number(candidate.seeds?.hp ?? fallback.seeds.hp), 0, 999)
    },
    familiar: normalizeEquipmentSelection(candidate.familiar, 'familiar'),
    aurasong: normalizeEquipmentSelection(candidate.aurasong, 'aurasong')
  };
}

function normalizeEquipmentSelection(value: unknown, slotId: string): EquipmentSelection {
  const candidate = value && typeof value === 'object' ? (value as Partial<EquipmentSelection>) : {};
  const quality = ITEM_QUALITIES.includes(candidate.quality as EquipmentSelection['quality']) ? candidate.quality : 'normal';
  return {
    slotId,
    itemId: typeof candidate.itemId === 'string' ? candidate.itemId : '',
    quality: quality ?? 'normal',
    elementId: typeof candidate.elementId === 'string' ? candidate.elementId : '',
    spiritId: typeof candidate.spiritId === 'string' ? candidate.spiritId : '',
    starforged: Boolean(candidate.starforged)
  };
}

function isHeroTab(tab: AppTab): tab is HeroTab {
  return tab.startsWith('hero-');
}

function getActiveHeroIndex(tab: AppTab): number {
  if (!isHeroTab(tab)) {
    return 0;
  }
  return clampNumber(Number(tab.replace('hero-', '')), 0, HERO_BUILD_COUNT - 1);
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
      return parsed.map((entry) => normalizeRoster(entry)).filter(Boolean) as RosterConfig[];
    }
  } catch {
    // Fall through to default roster.
  }
  return [defaultRoster(data)];
}

function normalizeRoster(value: unknown): RosterConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RosterConfig> & { championSkillId?: string };
  const fallback = defaultRoster(data);
  const migratedChampion = candidate.championSkillId
    ? data.champions.find((champion) => champion.leaderSkillIds.includes(candidate.championSkillId ?? ''))
    : undefined;
  const champion =
    data.champions.find((entry) => entry.id === candidate.championId) ?? migratedChampion ?? data.champions[0];
  const migratedRank =
    champion && candidate.championSkillId
      ? champion.rankRewards.find((reward) => reward.leaderSkillId === candidate.championSkillId)?.rank
      : undefined;
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  return {
    schemaVersion: 1,
    id: typeof candidate.id === 'string' ? candidate.id : fallback.id,
    name: typeof candidate.name === 'string' ? candidate.name : fallback.name,
    championId: champion?.id ?? fallback.championId,
    championRank: clampNumber(Number(candidate.championRank ?? migratedRank ?? maxRank), 1, maxRank),
    championPowerUps: clampNumber(Number(candidate.championPowerUps ?? 0), 0, 999),
    builds: Array.isArray(candidate.builds) ? candidate.builds : []
  };
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
