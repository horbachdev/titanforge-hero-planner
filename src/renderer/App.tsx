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
  UserRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import rawGameData from '../data/generated/game-data.json';
import { parseBuildJsonDetailed, serializeBuild, validateBuildConfig } from '../shared/build-io';
import {
  ITEM_QUALITIES,
  QUALITY_LABELS,
  createId,
  defaultBuild,
  emptyEquipmentForHero,
  getHero,
  getMaxTierForLevel,
  normalizeEquipmentForHero,
  slotLabel
} from '../shared/data-utils';
import { calculateHeroStats, getStarforgeStatMultiplier } from '../shared/engine';
import type { BuildConfig, EquipmentSelection, GameData, ItemData, StatBlock } from '../shared/types';

const data = rawGameData as GameData;
const CURRENT_BUILD_KEY = 'shopTitansHeroBuilder.currentBuild';
const SAVED_BUILDS_KEY = 'shopTitansHeroBuilder.savedBuilds';

type AppTab = 'builder' | 'compare' | 'items' | 'io';

const statLabels: Array<[keyof StatBlock, string]> = [
  ['attack', 'ATK'],
  ['defense', 'DEF'],
  ['hp', 'HP'],
  ['evasion', 'EVA'],
  ['critChance', 'CRIT'],
  ['critDamage', 'CDMG'],
  ['power', 'Power']
];

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('builder');
  const [build, setBuild] = useState<BuildConfig>(() => loadCurrentBuild());
  const [savedBuilds, setSavedBuilds] = useState<BuildConfig[]>(() => loadSavedBuilds());
  const [importText, setImportText] = useState('');
  const [ioMessage, setIoMessage] = useState('');

  const hero = getHero(data, build.heroClassId) ?? data.heroes[0];
  const normalizedBuild = hero ? { ...build, equipment: normalizeEquipmentForHero(build, hero) } : build;
  const resolvedBuild = useMemo(() => calculateHeroStats(normalizedBuild, data), [normalizedBuild]);

  useEffect(() => {
    window.localStorage.setItem(CURRENT_BUILD_KEY, serializeBuild(normalizedBuild));
  }, [normalizedBuild]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  function updateBuild(patch: Partial<BuildConfig>): void {
    setBuild((current) => ({ ...current, ...patch }));
  }

  function changeHero(heroClassId: string): void {
    const nextHero = getHero(data, heroClassId);
    if (!nextHero) {
      return;
    }
    setBuild((current) => ({
      ...current,
      heroClassId,
      promoted: nextHero.promoted,
      equipment: emptyEquipmentForHero(nextHero)
    }));
  }

  function updateEquipment(slotId: string, patch: Partial<EquipmentSelection>): void {
    setBuild((current) => ({
      ...current,
      equipment: normalizeEquipmentForHero(current, hero).map((entry) =>
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
    setSavedBuilds((current) => {
      const existing = current.findIndex((entry) => entry.id === copy.id);
      if (existing === -1) {
        return [...current, copy];
      }
      return current.map((entry, index) => (index === existing ? copy : entry));
    });
    setIoMessage(`Saved "${copy.name}".`);
  }

  function duplicateBuild(): void {
    setBuild((current) => ({
      ...current,
      id: createId('build'),
      name: `${current.name} Copy`
    }));
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

  const validationWarnings = validateBuildConfig(normalizedBuild, data);

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
                <select value={build.heroClassId} onChange={(event) => changeHero(event.target.value)}>
                  {data.heroes.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
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
                  onChange={(event) => updateBuild({ promoted: event.target.checked })}
                />
                Promoted
              </label>
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
                {[0, 1, 2, 3].map((index) => (
                  <label key={index}>
                    Slot {index + 1}
                    <select value={build.skills[index] ?? ''} onChange={(event) => updateSkill(index, event.target.value)}>
                      <option value="">Empty</option>
                      {skillOptions(hero.name).map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section className="subsection">
              <h3>Gear</h3>
              <div className="gear-list">
                {hero.slots.map((slot) => {
                  const selection =
                    normalizedBuild.equipment.find((entry) => entry.slotId === slot.id) ?? emptyEquipmentForHero(hero)[0];
                  return (
                    <GearRow
                      key={slot.id}
                      slotId={slot.id}
                      slotLabel={slotLabel(slot)}
                      allowedTypes={slot.allowedTypes}
                      selection={selection}
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
            <div className="stat-grid">
              {statLabels.map(([key, label]) => (
                <div className="stat-tile" key={key}>
                  <span>{label}</span>
                  <strong>{formatStat(key, resolvedBuild.stats[key])}</strong>
                </div>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={saveBuild}>
                <Save size={17} />
                Save Build
              </button>
              <button type="button" onClick={duplicateBuild}>
                <Plus size={17} />
                Duplicate
              </button>
            </div>
            <div className="gear-summary">
              {resolvedBuild.gear.map((line) => (
                <div className="summary-row" key={line.slotId}>
                  <span>{line.slotLabel}</span>
                  <strong>{line.itemName}</strong>
                  {line.starforged && <em>Starforged</em>}
                </div>
              ))}
            </div>
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
  slotId: string;
  slotLabel: string;
  allowedTypes: string[];
  selection: EquipmentSelection;
  buildLevel: number;
  onChange: (patch: Partial<EquipmentSelection>) => void;
}

function GearRow({ slotLabel, allowedTypes, selection, buildLevel, onChange }: GearRowProps): JSX.Element {
  const maxTier = getMaxTierForLevel(data, buildLevel);
  const items = useMemo(
    () =>
      data.items
        .filter((item) => allowedTypes.includes(item.type) && item.tier <= maxTier)
        .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name)),
    [allowedTypes, maxTier]
  );
  const selectedItem = data.items.find((item) => item.id === selection.itemId);
  const starforgeAvailable = selectedItem ? getStarforgeStatMultiplier(selectedItem) > 1 : false;

  return (
    <div className="gear-row">
      <label className="gear-item">
        {slotLabel}
        <select value={selection.itemId} onChange={(event) => onChange({ itemId: event.target.value })}>
          <option value="">Empty</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              T{item.tier} {item.name}
            </option>
          ))}
        </select>
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
      </label>
      <label>
        Spirit
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
    </div>
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
      <div>
        <strong>{item.name}</strong>
        <span>
          T{item.tier} {item.type}
        </span>
      </div>
      <div className="mini-stats">
        <span>ATK {item.stats.attack}</span>
        <span>DEF {item.stats.defense}</span>
        <span>HP {item.stats.hp}</span>
        {item.stats.evasion > 0 && <span>EVA {item.stats.evasion}%</span>}
        {item.stats.critChance > 0 && <span>CRIT {item.stats.critChance}%</span>}
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

function skillOptions(heroName: string) {
  const normalizedHero = heroName.toLowerCase();
  const filtered = data.skills.filter((skill) => {
    if (skill.type === 'Leader') {
      return false;
    }
    if (skill.classes.length === 0) {
      return true;
    }
    return skill.classes.some((entry) => entry.toLowerCase().includes(normalizedHero));
  });
  return filtered.length > 0 ? filtered : data.skills.filter((skill) => skill.type !== 'Leader').slice(0, 250);
}

function loadCurrentBuild(): BuildConfig {
  const stored = window.localStorage.getItem(CURRENT_BUILD_KEY);
  if (!stored) {
    return defaultBuild(data);
  }
  const parsed = parseBuildJsonDetailed(stored, data);
  return parsed.ok ? parsed.build : defaultBuild(data);
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
