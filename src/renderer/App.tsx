import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Crown,
  Database,
  GitCompare,
  Minus,
  Plus,
  Save,
  Search,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  UsersRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import rawGameData from '../data/generated/game-data.json';
import { parseBuildJsonDetailed, serializeBuild, validateBuildConfig } from '../shared/build-io';
import { calculateRessQuestSimulation, estimateQuestDefenseCap, getHeroSlotLimitForQuest, questToCombatInput } from '../shared/combat-engine';
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
  ResolvedBuild,
  ResolvedGearLine,
  ResolvedChampionBuild,
  RosterConfig,
  SkillData,
  StatBlock
} from '../shared/types';
import type { CombatantInput, CombatSpiritEffects, RessMiniBossModifier, RessQuestSimulation } from '../shared/combat-engine';
import { ChampionToken, EnchantmentToken, HeroToken, ItemToken, SkillToken, VisualToken } from './VisualToken';

const data = rawGameData as unknown as GameData;
const CURRENT_BUILD_KEY = 'shopTitansHeroBuilder.currentBuild';
const CHAMPION_BUILD_KEY = 'shopTitansHeroBuilder.championBuild';
const SAVED_BUILDS_KEY = 'shopTitansHeroBuilder.savedBuilds';
const SAVED_CHAMPIONS_KEY = 'shopTitansHeroBuilder.savedChampions';
const ROSTERS_KEY = 'shopTitansHeroBuilder.rosters';
const ACTIVE_ROSTER_KEY = 'shopTitansHeroBuilder.activeRoster';

const ROSTER_SLOT_COUNT = 5;
const rosterSlots = [0, 1, 2, 3, 4] as const;
const SIMULATION_RUN_PRESETS = [1000, 10000, 50000] as const;

type AppTab = 'hero' | 'champion' | 'library' | 'roster' | 'simulator';

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
  const [activeTab, setActiveTab] = useState<AppTab>('hero');
  const [build, setBuild] = useState<BuildConfig>(() => loadCurrentBuild());
  const [championBuild, setChampionBuild] = useState<ChampionBuildConfig>(() => loadChampionBuild());
  const [savedBuilds, setSavedBuilds] = useState<BuildConfig[]>(() => loadSavedBuilds());
  const [savedChampionBuilds, setSavedChampionBuilds] = useState<ChampionBuildConfig[]>(() => loadSavedChampionBuilds());
  const [rosters, setRosters] = useState<RosterConfig[]>(() => loadRosters());
  const [activeRosterId, setActiveRosterId] = useState(() => window.localStorage.getItem(ACTIVE_ROSTER_KEY) ?? '');
  const [simulatorQuestId, setSimulatorQuestId] = useState(() => data.quests[0]?.id ?? '');
  const [simulatorMiniBoss, setSimulatorMiniBoss] = useState<RessMiniBossModifier>('None');
  const [simulatorDefenseCaps, setSimulatorDefenseCaps] = useState<Record<string, number>>({});
  const [importText, setImportText] = useState('');
  const [ioMessage, setIoMessage] = useState('');

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
    window.localStorage.setItem(CHAMPION_BUILD_KEY, JSON.stringify(championBuild));
  }, [championBuild]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_CHAMPIONS_KEY, JSON.stringify(savedChampionBuilds));
  }, [savedChampionBuilds]);

  useEffect(() => {
    window.localStorage.setItem(ROSTERS_KEY, JSON.stringify(rosters));
  }, [rosters]);

  useEffect(() => {
    if (activeRoster.id) {
      window.localStorage.setItem(ACTIVE_ROSTER_KEY, activeRoster.id);
    }
  }, [activeRoster.id]);

  function setActiveBuild(nextBuild: BuildConfig): void {
    setBuild(nextBuild);
    setActiveTab('hero');
  }

  function updateActiveBuild(updater: (current: BuildConfig) => BuildConfig): void {
    setBuild((current) => updater(current));
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
    setBuild(copy);
    setIoMessage(`Saved "${copy.name}".`);
  }

  function resetBuild(): void {
    setBuild(defaultBuild(data));
    setActiveTab('hero');
    setIoMessage('');
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
      heroBuildIds: normalizeRosterHeroIds(activeRoster.heroBuildIds),
      championBuildId: activeRoster.championBuildId
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

  function updateSimulatorDefenseCap(questId: string, defenseCap: number): void {
    setSimulatorDefenseCaps((current) => ({
      ...current,
      [questId]: Math.max(0, Math.round(defenseCap || 0))
    }));
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

  function saveChampionBuild(): void {
    const copy = { ...championBuild, id: championBuild.id || createId('champion') };
    setSavedChampionBuilds((current) => upsertChampionBuild(current, copy));
    setChampionBuild(copy);
    setIoMessage(`Saved "${copy.name}".`);
  }

  function loadChampionBuildForEdit(nextBuild: ChampionBuildConfig): void {
    setChampionBuild(nextBuild);
    setActiveTab('champion');
  }

  function resetChampionBuild(): void {
    setChampionBuild(defaultChampionBuild(data));
    setActiveTab('champion');
    setIoMessage('');
  }

  function duplicateHeroBuild(buildToDuplicate: BuildConfig): void {
    const copy = {
      ...buildToDuplicate,
      id: createId('build'),
      name: `${buildToDuplicate.name} Copy`
    };
    setSavedBuilds((current) => [...current, copy]);
    setBuild(copy);
    setActiveTab('hero');
  }

  function duplicateChampionBuild(buildToDuplicate: ChampionBuildConfig): void {
    const copy = {
      ...buildToDuplicate,
      id: createId('champion'),
      name: `${buildToDuplicate.name} Copy`
    };
    setSavedChampionBuilds((current) => [...current, copy]);
    setChampionBuild(copy);
    setActiveTab('champion');
  }

  function deleteHeroBuild(buildId: string): void {
    setSavedBuilds((current) => current.filter((entry) => entry.id !== buildId));
    setRosters((current) =>
      current.map((roster) => ({
        ...roster,
        heroBuildIds: normalizeRosterHeroIds(roster.heroBuildIds).map((entry) => (entry === buildId ? null : entry))
      }))
    );
  }

  function deleteChampionBuild(buildId: string): void {
    setSavedChampionBuilds((current) => current.filter((entry) => entry.id !== buildId));
    setRosters((current) =>
      current.map((roster) => ({
        ...roster,
        championBuildId: roster.championBuildId === buildId ? '' : roster.championBuildId
      }))
    );
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
          <TabButton active={activeTab === 'hero'} onClick={() => setActiveTab('hero')} icon={<UserRound size={18} />}>
            Create Hero
          </TabButton>
          <TabButton active={activeTab === 'champion'} onClick={() => setActiveTab('champion')} icon={<Crown size={18} />}>
            Create Champion
          </TabButton>
          <TabButton active={activeTab === 'library'} onClick={() => setActiveTab('library')} icon={<Database size={18} />}>
            Library
          </TabButton>
          <TabButton active={activeTab === 'roster'} onClick={() => setActiveTab('roster')} icon={<UsersRound size={18} />}>
            Roster Management
          </TabButton>
          <TabButton active={activeTab === 'simulator'} onClick={() => setActiveTab('simulator')} icon={<Swords size={18} />}>
            Quest Simulator
          </TabButton>
        </nav>
      </header>

      {activeTab === 'hero' && (
        <main className="builder-grid">
          <section className="panel builder-panel">
            <div className="panel-title">
              <UserRound size={19} />
              <h2>Create Hero</h2>
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
                <h3>Hero Library</h3>
                <span>{savedBuilds.length} saved</span>
              </div>
              <label className="storage-load-field">
                Load Hero
                <select
                  value=""
                  disabled={savedBuilds.length === 0}
                  onChange={(event) => {
                    const nextBuild = savedBuilds.find((entry) => entry.id === event.target.value);
                    if (nextBuild) {
                      setActiveBuild(nextBuild);
                    }
                  }}
                >
                  <option value="">Choose saved hero</option>
                  {savedBuilds.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="action-row">
                <button type="button" className="primary-button" onClick={saveBuild}>
                  <Save size={17} />
                  Save Hero
                </button>
                <button type="button" onClick={resetBuild}>
                  Reset
                </button>
              </div>
            </div>
            <ElementPointsPanel scores={resolvedBuild.elementScores} />
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

      {activeTab === 'champion' && (
        <ChampionBuildPanel
          build={championBuild}
          resolved={resolvedChampionBuild}
          savedChampionBuilds={savedChampionBuilds}
          onChange={updateChampionBuild}
          onChangeChampion={changeChampion}
          onChangeEquipment={updateChampionEquipment}
          onSave={saveChampionBuild}
          onLoad={loadChampionBuildForEdit}
          onReset={resetChampionBuild}
        />
      )}

      {activeTab === 'library' && (
        <LibraryPanel
          savedBuilds={savedBuilds}
          savedChampionBuilds={savedChampionBuilds}
          onEditHero={setActiveBuild}
          onEditChampion={loadChampionBuildForEdit}
          onDuplicateHero={duplicateHeroBuild}
          onDuplicateChampion={duplicateChampionBuild}
          onDeleteHero={deleteHeroBuild}
          onDeleteChampion={deleteChampionBuild}
        />
      )}

      {activeTab === 'roster' && (
        <main className="roster-management-view">
          <RosterPanel
            activeRoster={activeRoster}
            rosters={rosters}
            savedBuilds={savedBuilds}
            savedChampionBuilds={savedChampionBuilds}
            onActiveRosterChange={setActiveRosterId}
            onCreateRoster={createRoster}
            onDuplicateRoster={duplicateRoster}
            onDeleteRoster={deleteActiveRoster}
            onUpdateRoster={updateRoster}
            onEditHero={setActiveBuild}
            onEditChampion={loadChampionBuildForEdit}
          />
        </main>
      )}

      {activeTab === 'simulator' && (
        <QuestSimulatorPanel
          activeRoster={activeRoster}
          rosters={rosters}
          savedBuilds={savedBuilds}
          savedChampionBuilds={savedChampionBuilds}
          questId={simulatorQuestId}
          miniBoss={simulatorMiniBoss}
          defenseCapOverrides={simulatorDefenseCaps}
          onActiveRosterChange={setActiveRosterId}
          onQuestChange={setSimulatorQuestId}
          onMiniBossChange={setSimulatorMiniBoss}
          onDefenseCapChange={updateSimulatorDefenseCap}
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
  savedChampionBuilds,
  onActiveRosterChange,
  onCreateRoster,
  onDuplicateRoster,
  onDeleteRoster,
  onUpdateRoster,
  onEditHero,
  onEditChampion
}: {
  activeRoster: RosterConfig;
  rosters: RosterConfig[];
  savedBuilds: BuildConfig[];
  savedChampionBuilds: ChampionBuildConfig[];
  onActiveRosterChange: (id: string) => void;
  onCreateRoster: () => void;
  onDuplicateRoster: () => void;
  onDeleteRoster: () => void;
  onUpdateRoster: (patch: Partial<RosterConfig>) => void;
  onEditHero: (build: BuildConfig) => void;
  onEditChampion: (build: ChampionBuildConfig) => void;
}): JSX.Element {
  const heroBuildIds = normalizeRosterHeroIds(activeRoster.heroBuildIds);
  const slotBuilds = heroBuildIds.map((buildId) => savedBuilds.find((entry) => entry.id === buildId) ?? null);
  const championBuild = savedChampionBuilds.find((entry) => entry.id === activeRoster.championBuildId) ?? null;
  const resolvedChampion = championBuild ? calculateChampionBuildStats(championBuild, data) : null;
  const resolvedSlots = slotBuilds.map((build) =>
    build ? calculateHeroStats(build, data, { championSkillId: resolvedChampion?.leaderSkill?.id }) : null
  );
  const resolved = resolvedSlots.filter((entry): entry is ResolvedBuild => Boolean(entry));
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
    const rosterHeroIds = normalizeRosterHeroIds(roster.heroBuildIds);
    const rosterChampionBuild = savedChampionBuilds.find((entry) => entry.id === roster.championBuildId) ?? null;
    const rosterChampionResolved = rosterChampionBuild ? calculateChampionBuildStats(rosterChampionBuild, data) : null;
    const rosterResolved = rosterHeroIds
      .map((buildId) => savedBuilds.find((entry) => entry.id === buildId) ?? null)
      .filter((build): build is BuildConfig => Boolean(build))
      .map((build) => calculateHeroStats(build, data, { championSkillId: rosterChampionResolved?.leaderSkill?.id }));
    return {
      roster,
      championName: rosterChampionBuild?.name ?? 'No champion',
      heroCount: rosterResolved.length,
      power: rosterResolved.reduce((total, entry) => total + entry.stats.power, 0)
    };
  });

  function setHeroSlot(slotIndex: number, buildId: string): void {
    const nextHeroBuildIds = [...heroBuildIds];
    nextHeroBuildIds[slotIndex] = buildId || null;
    onUpdateRoster({ heroBuildIds: nextHeroBuildIds });
  }

  return (
    <section className="panel roster-panel">
      <div className="panel-title">
        <UsersRound size={19} />
        <h2>Roster Management</h2>
      </div>
      <div className="roster-save-state">
        <Save size={15} />
        <span>{rosters.length} saved roster{rosters.length === 1 ? '' : 's'} | autosaved locally</span>
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
            <span>{summary.heroCount} / 5 heroes</span>
            <span>{summary.championName}</span>
            <span>PWR {summary.power.toLocaleString()}</span>
          </button>
        ))}
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
      <div className="roster-overview">
        <div>
          <span>Heroes</span>
          <strong>{resolved.length} / 5</strong>
        </div>
        <div>
          <span>Champion</span>
          <strong>{championBuild?.name ?? 'None'}</strong>
        </div>
        <div>
          <span>Team Power</span>
          <strong>{totals.power.toLocaleString()}</strong>
        </div>
      </div>
      <div className="roster-aura-note">
        <ChampionToken champion={resolvedChampion?.champion ?? undefined} />
        <span>
          {resolvedChampion?.leaderSkill
            ? `${championBuild?.name ?? 'Champion'} affects this roster with ${resolvedChampion.leaderSkill.name}.`
            : 'No champion aura is active for this roster.'}
        </span>
      </div>
      <div className="roster-slot-grid">
        {rosterSlots.map((slotIndex) => {
          const slotBuild = slotBuilds[slotIndex];
          const slotResolved = resolvedSlots[slotIndex];
          return (
            <article className="roster-slot-card" key={slotIndex}>
              <div className="roster-slot-main static-slot-main">
                <HeroToken hero={slotResolved?.hero ?? undefined} />
                <span>
                  <strong>Hero Slot {slotIndex + 1}</strong>
                  <small>{slotBuild ? `${slotBuild.name} | ${slotResolved?.hero?.name ?? 'Unknown'}` : 'Empty slot'}</small>
                </span>
              </div>
              {slotResolved ? <StatStrip stats={slotResolved.stats} /> : <p className="muted">Optional hero slot.</p>}
              {slotResolved && <ElementPointStrip scores={slotResolved.elementScores} compact />}
              <label className="slot-load-field">
                Load Hero
                <select value={heroBuildIds[slotIndex] ?? ''} onChange={(event) => setHeroSlot(slotIndex, event.target.value)}>
                  <option value="">Empty</option>
                  {savedBuilds.map((savedBuild) => (
                    <option key={savedBuild.id} value={savedBuild.id}>
                      {savedBuild.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="roster-slot-actions">
                <button type="button" disabled={!slotBuild} onClick={() => slotBuild && onEditHero(slotBuild)}>
                  Edit
                </button>
                <button type="button" disabled={!slotBuild} onClick={() => setHeroSlot(slotIndex, '')}>
                  Remove
                </button>
              </div>
            </article>
          );
        })}
        <article className="roster-slot-card champion-slot">
          <div className="roster-slot-main static-slot-main">
            <ChampionToken champion={resolvedChampion?.champion ?? undefined} />
            <span>
              <strong>Champion Slot</strong>
              <small>{championBuild ? `${championBuild.name} | ${resolvedChampion?.leaderSkill?.name ?? 'No aura'}` : 'No champion'}</small>
            </span>
          </div>
          <label className="slot-load-field">
            Load Champion
            <select value={activeRoster.championBuildId} onChange={(event) => onUpdateRoster({ championBuildId: event.target.value })}>
              <option value="">Empty</option>
              {savedChampionBuilds.map((savedChampion) => (
                <option key={savedChampion.id} value={savedChampion.id}>
                  {savedChampion.name}
                </option>
              ))}
            </select>
          </label>
          <div className="roster-slot-actions">
            <button type="button" disabled={!championBuild} onClick={() => championBuild && onEditChampion(championBuild)}>
              Edit
            </button>
            <button type="button" disabled={!championBuild} onClick={() => onUpdateRoster({ championBuildId: '' })}>
              Remove
            </button>
          </div>
        </article>
      </div>
      <div className="team-total-panel">
        <h3>Team Totals</h3>
        <StatGrid stats={totals} />
        <ElementPointsPanel scores={totalElementScores} />
      </div>
    </section>
  );
}

function QuestSimulatorPanel({
  activeRoster,
  rosters,
  savedBuilds,
  savedChampionBuilds,
  questId,
  miniBoss,
  defenseCapOverrides,
  onActiveRosterChange,
  onQuestChange,
  onMiniBossChange,
  onDefenseCapChange
}: {
  activeRoster: RosterConfig;
  rosters: RosterConfig[];
  savedBuilds: BuildConfig[];
  savedChampionBuilds: ChampionBuildConfig[];
  questId: string;
  miniBoss: RessMiniBossModifier;
  defenseCapOverrides: Record<string, number>;
  onActiveRosterChange: (id: string) => void;
  onQuestChange: (id: string) => void;
  onMiniBossChange: (miniBoss: RessMiniBossModifier) => void;
  onDefenseCapChange: (questId: string, defenseCap: number) => void;
}): JSX.Element {
  const [simulationRuns, setSimulationRuns] = useState(10000);
  const selectedQuest = data.quests.find((quest) => quest.id === questId) ?? data.quests[0];
  const questDefenseCap = selectedQuest
    ? defenseCapOverrides[selectedQuest.id] ?? (selectedQuest.defenseCap || estimateQuestDefenseCap(selectedQuest))
    : 0;
  const questInput = selectedQuest ? questToCombatInput(selectedQuest, questDefenseCap, miniBoss) : null;
  const heroBuildIds = normalizeRosterHeroIds(activeRoster.heroBuildIds);
  const heroSlotLimit = selectedQuest ? getHeroSlotLimitForQuest(selectedQuest) : 4;
  const activeHeroBuildIds = heroBuildIds.slice(0, heroSlotLimit);
  const ignoredHeroSlotCount = heroBuildIds.slice(heroSlotLimit).filter(Boolean).length;
  const championBuild = savedChampionBuilds.find((entry) => entry.id === activeRoster.championBuildId) ?? null;
  const resolvedChampion = championBuild ? calculateChampionBuildStats(championBuild, data) : null;
  const resolvedHeroes = activeHeroBuildIds
    .map((buildId) => savedBuilds.find((entry) => entry.id === buildId) ?? null)
    .filter((build): build is BuildConfig => Boolean(build))
    .map((build) => calculateHeroStats(build, data));
  const championAurasongName = resolvedChampion?.gear.find((line) => line.slotId === 'aurasong' && line.itemName !== 'Empty')?.itemName ?? '';
  const combatants: CombatantInput[] = [
    ...(resolvedChampion
      ? [
          {
            id: `champion-${resolvedChampion.build.id}`,
            name: championBuild?.name ?? resolvedChampion.champion?.name ?? 'Champion',
            kind: 'champion' as const,
            stats: resolvedChampion.stats,
            elementScores: resolvedChampion.elementScores,
            className: resolvedChampion.champion?.name,
            role: 'champion' as const,
            tier: resolvedChampion.leaderSkill?.tier ?? 0,
            modifiers: resolvedChampion.modifiers,
            combatEffects: {
              ...combatEffectsFromGear(resolvedChampion.gear),
              aurasongName: championAurasongName
            }
          }
        ]
      : []),
    ...resolvedHeroes.map((resolved) => ({
      id: `hero-${resolved.build.id}`,
      name: resolved.build.name,
      kind: 'hero' as const,
      stats: resolved.stats,
      elementScores: resolved.elementScores,
      className: resolved.hero?.name,
      role: resolved.hero?.role ?? 'unknown',
      tier: ressInnateTier(resolved),
      modifiers: resolved.modifiers,
      combatEffects: combatEffectsFromGear(resolved.gear)
    }))
  ];
  const simulation = useMemo(
    () => (questInput ? calculateRessQuestSimulation(questInput, combatants, { runs: simulationRuns }) : null),
    [questInput, combatants, simulationRuns]
  );
  const teamPower =
    resolvedHeroes.reduce((total, entry) => total + entry.stats.power, 0) + (resolvedChampion?.stats.power ?? 0);
  const totalElementScores = [
    ...resolvedHeroes.map((entry) => entry.elementScores),
    ...(resolvedChampion ? [resolvedChampion.elementScores] : [])
  ].reduce((acc, scores) => mergeElementScores(acc, scores), {} as ElementScores);
  const capIsEstimated = Boolean(selectedQuest && selectedQuest.defenseCap <= 0 && defenseCapOverrides[selectedQuest.id] === undefined);
  const quickResult = simulation ? quickResultForSimulation(simulation) : null;

  return (
    <main className="simulator-view">
      <section className="panel simulator-panel">
        <div className="panel-title">
          <Swords size={19} />
          <h2>Quest Simulator</h2>
        </div>

        <div className="simulator-toolbar">
          <label>
            Roster
            <select value={activeRoster.id} onChange={(event) => onActiveRosterChange(event.target.value)}>
              {rosters.map((roster) => (
                <option key={roster.id} value={roster.id}>
                  {roster.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quest
            <select value={selectedQuest?.id ?? ''} onChange={(event) => onQuestChange(event.target.value)}>
              {data.quests.map((quest) => (
                <option key={quest.id} value={quest.id}>
                  {formatQuestName(quest)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mini-boss
            <select value={miniBoss} onChange={(event) => onMiniBossChange(event.target.value as RessMiniBossModifier)}>
              {(['None', 'Agile', 'Dire', 'Huge', 'Legendary'] as RessMiniBossModifier[]).map((modifier) => (
                <option key={modifier} value={modifier}>
                  {modifier}
                </option>
              ))}
            </select>
          </label>
          <label>
            Defense cap
            <input
              type="number"
              min={0}
              value={questDefenseCap}
              onChange={(event) => selectedQuest && onDefenseCapChange(selectedQuest.id, event.target.valueAsNumber)}
            />
          </label>
          <div className="run-control">
            <span className="control-label">Monte Carlo runs</span>
            <div className="run-stepper">
              <button
                type="button"
                aria-label="Decrease Monte Carlo runs"
                onClick={() => setSimulationRuns((current) => clampNumber(current - 1000, 1000, 50000))}
              >
                <Minus size={14} />
              </button>
              <label>
                <span className="sr-only">Runs</span>
                <input
                  type="number"
                  min={1000}
                  max={50000}
                  step={1000}
                  value={simulationRuns}
                  onChange={(event) => setSimulationRuns(clampNumber(event.target.valueAsNumber, 1000, 50000))}
                />
              </label>
              <button
                type="button"
                aria-label="Increase Monte Carlo runs"
                onClick={() => setSimulationRuns((current) => clampNumber(current + 1000, 1000, 50000))}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="run-presets" aria-label="Monte Carlo run presets">
              {SIMULATION_RUN_PRESETS.map((runs) => (
                <button
                  key={runs}
                  type="button"
                  className={simulationRuns === runs ? 'active' : ''}
                  aria-pressed={simulationRuns === runs}
                  onClick={() => setSimulationRuns(runs)}
                >
                  {formatRunCount(runs)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedQuest && simulation && (
          <>
            {quickResult && (
              <div className={`quick-result-card ${quickResult.tone}`}>
                <span>Quick Result</span>
                <strong>{quickResult.label}</strong>
                <small>{quickResult.detail}</small>
              </div>
            )}

            <div className="simulator-overview">
              <div>
                <span>Quest HP</span>
                <strong>{simulation.enemy.hp.toLocaleString()}</strong>
              </div>
              <div>
                <span>Enemy ATK</span>
                <strong>{simulation.enemy.attack.toLocaleString()}</strong>
              </div>
              <div>
                <span>Defense Cap</span>
                <strong>{questDefenseCap.toLocaleString()}</strong>
              </div>
              <div>
                <span>AoE</span>
                <strong>
                  {selectedQuest.aoeDamage > 0
                    ? `${selectedQuest.aoeDamage.toLocaleString()} @ ${formatPercent(simulation.enemy.aoeChance)}`
                    : 'None'}
                </strong>
              </div>
              <div>
                <span>Team ATK</span>
                <strong>{simulation.rows.reduce((total, row) => total + row.stats.attack, 0).toLocaleString()}</strong>
              </div>
              <div>
                <span>Win Rate</span>
                <strong>{formatPercent(simulation.successRate)}</strong>
              </div>
              <div>
                <span>Survival</span>
                <strong>
                  {simulation.rows.filter((row) => row.survives).length} / {simulation.occupiedCombatants}
                </strong>
              </div>
              <div>
                <span>Team Power</span>
                <strong>{teamPower.toLocaleString()}</strong>
              </div>
              <div>
                <span>Hero Slots</span>
                <strong>
                  {resolvedHeroes.length} / {heroSlotLimit}
                </strong>
              </div>
              <div>
                <span>Quest Flags</span>
                <strong>
                  {[
                    selectedQuest.lcog ? 'LCoG' : '',
                    selectedQuest.isBoss ? 'Boss' : '',
                    selectedQuest.isExtreme ? 'Extreme' : '',
                    simulation.enemy.miniBoss !== 'None' ? simulation.enemy.miniBoss : ''
                  ]
                    .filter(Boolean)
                    .join(', ') || 'Normal'}
                </strong>
              </div>
              <div>
                <span>Enemy Crit</span>
                <strong>{formatPercent(simulation.enemy.critChance)}</strong>
              </div>
              <div>
                <span>Enemy EVA</span>
                <strong>{simulation.enemy.evasion > 0 ? formatPercent(simulation.enemy.evasion) : 'None'}</strong>
              </div>
              <div>
                <span>Rounds</span>
                <strong>
                  {simulation.minimumRounds} / {formatCompactNumber(simulation.averageRounds)} / {simulation.maximumRounds}
                </strong>
              </div>
              <div>
                <span>Runs</span>
                <strong>{simulation.simulations.toLocaleString()}</strong>
              </div>
            </div>

            <div className={`simulator-result ${quickResult?.tone ?? 'warning'}`}>
              <strong>{quickResult?.label ?? 'No result'}</strong>
              <span>
                Barrier {simulation.barrier.met ? 'met' : 'short'}: {formatCompactNumber(simulation.barrier.available)} / {simulation.barrier.required}
              </span>
            </div>

            <div className="simulator-table-wrap">
              <table className="simulator-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>HP</th>
                    <th>ATK</th>
                    <th>DEF</th>
                    <th>EVA</th>
                    <th>CRIT</th>
                    <th>Threat</th>
                    <th>Target %</th>
                    <th>Dmg / hit</th>
                    <th>Crit hit</th>
                    <th>Survival</th>
                    <th>Avg HP</th>
                    <th>Avg dmg</th>
                    <th>Max dmg</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.rows.map((row) => (
                    <tr key={row.combatant.id}>
                      <td>
                        <span className="simulator-unit">
                          {row.combatant.kind === 'champion' ? (
                            <ChampionToken champion={resolvedChampion?.champion ?? undefined} />
                          ) : (
                            <HeroToken hero={resolvedHeroes.find((entry) => `hero-${entry.build.id}` === row.combatant.id)?.hero} />
                          )}
                          <strong>{row.combatant.name}</strong>
                        </span>
                      </td>
                      <td>{row.stats.hp.toLocaleString()}</td>
                      <td>{row.stats.attack.toLocaleString()}</td>
                      <td>{row.stats.defense.toLocaleString()}</td>
                      <td>{formatPercent(row.stats.evasion)}</td>
                      <td>{formatPercent(row.stats.critChance)}</td>
                      <td>{row.stats.threat.toLocaleString()}</td>
                      <td>{formatPercent(row.targetPercent)}</td>
                      <td>{row.damagePerHit.toLocaleString()}</td>
                      <td>{row.criticalDamagePerHit.toLocaleString()}</td>
                      <td>{formatPercent(row.survivalRate)}</td>
                      <td>{formatCompactNumber(row.averageHpRemaining)}</td>
                      <td>{formatCompactNumber(row.averageDamageDealt)}</td>
                      <td>{formatCompactNumber(row.maximumDamageDealt)}</td>
                      <td>
                        <span className={row.survives ? 'result-pill success' : 'result-pill warning'}>
                          {row.survives ? 'Stable' : row.survivalRate > 0 ? 'Risk' : 'Falls'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {simulation.rows.length === 0 && (
                    <tr>
                      <td colSpan={15}>No saved roster units loaded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="simulator-bottom-grid">
              <div className="team-total-panel compact-team-panel">
                <h3>Team Elements</h3>
                <ElementPointsPanel scores={totalElementScores} />
              </div>
              <div className="warning-box simulator-notes">
                {capIsEstimated && <p>Defense cap is estimated because no Ress defense-cap value was imported for this quest.</p>}
                {ignoredHeroSlotCount > 0 && (
                  <p>
                    {ignoredHeroSlotCount} saved hero slot{ignoredHeroSlotCount === 1 ? '' : 's'} ignored for this quest. LCoG quests use up to
                    5 hero slots; normal quests use the imported party limit capped at 4.
                  </p>
                )}
                <p>Quick Result uses seeded Ress-style Monte Carlo with enemy crits, mini-boss modifiers, evasion, AoE rolls, healing, fatal-blow saves, barriers, LCoG slot limits, combat spirits, and mapped champion/aura effects.</p>
                <p>Rest time, break chance, Tamas randomness, and non-combat drop side effects remain outside the MVP simulator.</p>
                {simulation.roundLimitHit && <p>Round limit hit in {formatPercent(simulation.roundLimitRate)} of runs.</p>}
                {simulation.poloniaLootAverage > 0 && <p>Polonia loot average: {formatCompactNumber(simulation.poloniaLootAverage)} per run.</p>}
                {simulation.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function LibraryPanel({
  savedBuilds,
  savedChampionBuilds,
  onEditHero,
  onEditChampion,
  onDuplicateHero,
  onDuplicateChampion,
  onDeleteHero,
  onDeleteChampion
}: {
  savedBuilds: BuildConfig[];
  savedChampionBuilds: ChampionBuildConfig[];
  onEditHero: (build: BuildConfig) => void;
  onEditChampion: (build: ChampionBuildConfig) => void;
  onDuplicateHero: (build: BuildConfig) => void;
  onDuplicateChampion: (build: ChampionBuildConfig) => void;
  onDeleteHero: (id: string) => void;
  onDeleteChampion: (id: string) => void;
}): JSX.Element {
  const [filter, setFilter] = useState<'all' | 'heroes' | 'champions'>('all');
  const showHeroes = filter === 'all' || filter === 'heroes';
  const showChampions = filter === 'all' || filter === 'champions';

  return (
    <main className="library-view">
      <section className="panel library-panel">
        <div className="panel-title">
          <Database size={19} />
          <h2>Library</h2>
        </div>
        <div className="library-filter" role="group" aria-label="Library filter">
          <button type="button" className={filter === 'all' ? 'active' : undefined} onClick={() => setFilter('all')}>
            All
          </button>
          <button type="button" className={filter === 'heroes' ? 'active' : undefined} onClick={() => setFilter('heroes')}>
            Heroes
          </button>
          <button type="button" className={filter === 'champions' ? 'active' : undefined} onClick={() => setFilter('champions')}>
            Champions
          </button>
        </div>

        {showHeroes && (
          <section className="library-section">
            <div className="library-section-head">
              <h3>Heroes</h3>
              <span>{savedBuilds.length}</span>
            </div>
            {savedBuilds.length === 0 && <p className="muted">No saved heroes yet.</p>}
            <div className="library-list">
              {savedBuilds.map((entry) => {
                const resolved = calculateHeroStats(entry, data);
                return (
                  <article className="library-card" key={entry.id}>
                    <div className="library-card-main">
                      <HeroToken hero={resolved.hero} />
                      <span>
                        <strong>{entry.name}</strong>
                        <small>{resolved.hero?.name ?? 'Unknown'} | Lv {entry.level} | PWR {resolved.stats.power.toLocaleString()}</small>
                      </span>
                    </div>
                    <StatStrip stats={resolved.stats} />
                    <ElementPointStrip scores={resolved.elementScores} compact />
                    <div className="library-card-actions">
                      <button type="button" onClick={() => onEditHero(entry)}>Edit</button>
                      <button type="button" onClick={() => onDuplicateHero(entry)}>Duplicate</button>
                      <button type="button" className="icon-button" aria-label={`Delete ${entry.name}`} onClick={() => onDeleteHero(entry.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {showChampions && (
          <section className="library-section">
            <div className="library-section-head">
              <h3>Champions</h3>
              <span>{savedChampionBuilds.length}</span>
            </div>
            {savedChampionBuilds.length === 0 && <p className="muted">No saved champions yet.</p>}
            <div className="library-list">
              {savedChampionBuilds.map((entry) => {
                const resolved = calculateChampionBuildStats(entry, data);
                return (
                  <article className="library-card" key={entry.id}>
                    <div className="library-card-main">
                      <ChampionToken champion={resolved.champion ?? undefined} />
                      <span>
                        <strong>{entry.name}</strong>
                        <small>
                          {resolved.champion?.name ?? 'Unknown'} | Rank {entry.rank} | PWR {resolved.stats.power.toLocaleString()}
                        </small>
                      </span>
                    </div>
                    <div className="active-aura-chip compact-aura-chip">
                      <SkillToken skill={resolved.leaderSkill ?? undefined} />
                      <span>Aura</span>
                      <strong>{resolved.leaderSkill?.name ?? 'None'}</strong>
                    </div>
                    <div className="library-card-actions">
                      <button type="button" onClick={() => onEditChampion(entry)}>Edit</button>
                      <button type="button" onClick={() => onDuplicateChampion(entry)}>Duplicate</button>
                      <button type="button" className="icon-button" aria-label={`Delete ${entry.name}`} onClick={() => onDeleteChampion(entry.id)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
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
  savedChampionBuilds,
  onChange,
  onChangeChampion,
  onChangeEquipment,
  onSave,
  onLoad,
  onReset
}: {
  build: ChampionBuildConfig;
  resolved: ResolvedChampionBuild;
  savedChampionBuilds: ChampionBuildConfig[];
  onChange: (patch: Partial<ChampionBuildConfig>) => void;
  onChangeChampion: (championId: string) => void;
  onChangeEquipment: (slot: 'familiar' | 'aurasong', patch: Partial<EquipmentSelection>) => void;
  onSave: () => void;
  onLoad: (build: ChampionBuildConfig) => void;
  onReset: () => void;
}): JSX.Element {
  const champion = resolved.champion ?? data.champions.find((entry) => entry.id === build.championId) ?? data.champions[0];
  const maxRank = champion ? getChampionMaxRank(champion) : 1;
  const rankResolved = champion ? resolveChampion(champion, data, build.rank, build.powerUps) : null;

  return (
    <div className="builder-grid champion-builder-grid">
      <section className="panel builder-panel">
        <div className="panel-title">
          <Crown size={19} />
          <h2>Create Champion</h2>
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
        <div className="storage-panel">
          <div className="storage-panel-head">
            <h3>Champion Library</h3>
            <span>{savedChampionBuilds.length} saved</span>
          </div>
          <label className="storage-load-field">
            Load Champion
            <select
              value=""
              disabled={savedChampionBuilds.length === 0}
              onChange={(event) => {
                const nextBuild = savedChampionBuilds.find((entry) => entry.id === event.target.value);
                if (nextBuild) {
                  onLoad(nextBuild);
                }
              }}
            >
              <option value="">Choose saved champion</option>
              {savedChampionBuilds.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={onSave}>
              <Save size={17} />
              Save Champion
            </button>
            <button type="button" onClick={onReset}>
              Reset
            </button>
          </div>
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
    </div>
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

function formatQuestName(quest: GameData['quests'][number]): string {
  return `${titleCase(quest.zone)} | ${quest.type} | ${quest.difficulty}`;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
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

function upsertChampionBuild(builds: ChampionBuildConfig[], build: ChampionBuildConfig): ChampionBuildConfig[] {
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

function createDefaultRosterSlotBuild(slotIndex: number): BuildConfig {
  return {
    ...defaultBuild(data),
    id: createId('build'),
    name: `Hero Slot ${slotIndex + 1}`
  };
}

function normalizeRosterSlots(value: unknown): Array<BuildConfig | null> {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: ROSTER_SLOT_COUNT }, (_, index) => {
    const candidate = source[index];
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }
    const parsed = parseBuildJsonDetailed(JSON.stringify(candidate), data);
    return parsed.ok ? parsed.build : null;
  });
}

function normalizeRosterHeroIds(value: unknown, legacyBuilds?: unknown): Array<string | null> {
  const source = Array.isArray(value) ? value : [];
  const ids = Array.from({ length: ROSTER_SLOT_COUNT }, (_, index) => {
    const candidate = source[index];
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  });
  if (ids.some(Boolean)) {
    return ids;
  }
  return normalizeRosterSlots(legacyBuilds).map((entry) => entry?.id ?? null);
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

function loadSavedChampionBuilds(): ChampionBuildConfig[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_CHAMPIONS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => normalizeChampionBuild(entry)).filter(Boolean) as ChampionBuildConfig[];
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
  const candidate = value as Partial<RosterConfig> & { builds?: unknown; championSkillId?: string };
  const fallback = defaultRoster(data);
  return {
    schemaVersion: 1,
    id: typeof candidate.id === 'string' ? candidate.id : fallback.id,
    name: typeof candidate.name === 'string' ? candidate.name : fallback.name,
    heroBuildIds: normalizeRosterHeroIds(candidate.heroBuildIds, candidate.builds),
    championBuildId: typeof candidate.championBuildId === 'string' ? candidate.championBuildId : fallback.championBuildId
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Math.round(value * 100) / 100 === Math.round(value)
    ? Math.round(value).toLocaleString()
    : (Math.round(value * 100) / 100).toLocaleString();
}

function formatRunCount(value: number): string {
  return value >= 1000 ? `${value / 1000}K` : value.toLocaleString();
}

function quickResultForSimulation(simulation: RessQuestSimulation): {
  label: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'empty';
} {
  const total = simulation.occupiedCombatants;
  const stableSurvivors = simulation.rows.filter((row) => row.survives).length;
  const anySurvivors = simulation.rows.filter((row) => row.survivalRate > 0).length;
  const barrierDetail = simulation.barrier.required > 0
    ? ` Barrier ${simulation.barrier.met ? 'met' : 'short'}: ${formatCompactNumber(simulation.barrier.available)} / ${simulation.barrier.required}.`
    : '';
  const runDetail = `Win ${formatPercent(simulation.successRate)} over ${simulation.simulations.toLocaleString()} seeded runs.${barrierDetail}`;

  if (total === 0) {
    return {
      label: 'No roster loaded',
      detail: 'Load saved heroes and a champion into the active roster.',
      tone: 'empty'
    };
  }

  if (stableSurvivors === total) {
    return {
      label: 'All survive',
      detail: `${stableSurvivors} / ${total} units are stable. ${runDetail}`,
      tone: simulation.barrier.met ? 'success' : 'warning'
    };
  }

  if (anySurvivors > 0) {
    return {
      label: 'Some survive',
      detail: `${anySurvivors} / ${total} units survive at least one run. ${runDetail}`,
      tone: 'warning'
    };
  }

  return {
    label: 'None survive',
    detail: `0 / ${total} units survive. ${runDetail}`,
    tone: 'danger'
  };
}

function ressInnateTier(resolved: ResolvedBuild): number {
  return resolved.innateSkills[0]?.tier ?? (resolved.hero?.promoted ? 4 : 0);
}

function combatEffectsFromGear(gear: ResolvedGearLine[]): CombatSpiritEffects & { artifact?: string } {
  const effects: CombatSpiritEffects & { artifact?: string } = {
    armadillo: 0,
    lizard: 0,
    shark: 0,
    dinosaur: 0,
    mundra: 0,
    artifact: undefined
  };
  const artifact = gear.find((line) =>
    [
      'Kiku-Ichimonji',
      'Pickaxe of Greed',
      'Lone Wolf Cowl',
      'Rock Stompers',
      'Backfire Hammer',
      'Torc of Peace',
      'Armor of Invincibility',
      'Wyrmbane Cannon',
      "Grimar's Collection"
    ].includes(line.itemName)
  );
  effects.artifact = artifact?.itemName;

  for (const line of gear) {
    const spiritMultiplier = /^(Idol|Totem)$/i.test(line.itemType) ? 2 : 1;
    const affinityBonus = line.affinityBonuses.some((bonus) => /Ress matched spirit columns/i.test(bonus));
    for (const source of line.spiritSources) {
      const normalized = source.toLowerCase();
      if (normalized.includes('armadillo')) {
        effects.armadillo += (15 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('dinosaur')) {
        effects.dinosaur += (25 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('shark')) {
        effects.shark += (20 + (affinityBonus ? 10 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('lizard') || normalized.includes('phoenix')) {
        effects.lizard += (3 + (affinityBonus ? 2 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('ouroboros') || normalized.includes('ouruboros')) {
        effects.lizard += (4 + (affinityBonus ? 2 : 0)) * spiritMultiplier;
      }
      if (normalized.includes('mundra')) {
        effects.mundra += spiritMultiplier;
      }
    }
  }

  return effects;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
