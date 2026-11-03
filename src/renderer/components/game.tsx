import { findBuiltInEnchantment, skillsForHero } from '../../shared/catalog';
import type { GameRepository } from '../../shared/data/repository';
import { ELEMENT_LABELS } from '../../shared/team';
import type { BuildConfig, ElementScores, EnchantmentData, GameData, HeroData, ItemData, ItemStats, SkillData, StatBlock } from '../../shared/types';
import { ElementGem } from './art';
import type { ComboOption } from './Combobox';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('en-US');

export function fmt(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function fmtPercent(value: number, digits = 1): string {
  const factor = 10 ** digits;
  return `${Math.round(value * factor) / factor}%`;
}

export function fmtSigned(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fmt(Math.abs(value))}`;
}

export const STAT_META: Array<{ key: keyof StatBlock; label: string; short: string; format: (value: number) => string; help: string }> = [
  { key: 'hp', label: 'Health', short: 'HP', format: fmt, help: 'Damage a unit can take before falling.' },
  { key: 'attack', label: 'Attack', short: 'ATK', format: fmt, help: 'Damage dealt per hit.' },
  { key: 'defense', label: 'Defense', short: 'DEF', format: fmt, help: 'Reduces damage taken, up to the quest defense cap.' },
  { key: 'critChance', label: 'Crit chance', short: 'CRIT', format: (value) => fmtPercent(value), help: 'Chance to land a critical hit.' },
  {
    key: 'critDamage',
    label: 'Crit damage',
    short: 'CDMG',
    format: (value) => `${Math.round(value * 100) / 100}×`,
    help: 'Damage multiplier on critical hits.'
  },
  { key: 'evasion', label: 'Evasion', short: 'EVA', format: (value) => fmtPercent(value), help: 'Chance to dodge an enemy attack (max 75%).' },
  { key: 'threat', label: 'Threat', short: 'THR', format: fmt, help: 'Higher threat draws more enemy attacks.' }
];

/** The class a build actually plays as (promoted class when promoted). */
export function buildHero(repo: GameRepository, build: Pick<BuildConfig, 'heroClassId' | 'promoted'>): HeroData | undefined {
  const base = repo.hero(build.heroClassId);
  return build.promoted && base?.promotedClassId ? (repo.hero(base.promotedClassId) ?? base) : base;
}

export function itemStatSummary(stats: Partial<ItemStats>): string {
  return [
    stats.attack ? `ATK ${fmt(stats.attack)}` : '',
    stats.defense ? `DEF ${fmt(stats.defense)}` : '',
    stats.hp ? `HP ${fmt(stats.hp)}` : '',
    stats.critChance ? `CRIT ${fmtPercent(stats.critChance)}` : '',
    stats.evasion ? `EVA ${fmtPercent(stats.evasion)}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Small visual pieces
// ---------------------------------------------------------------------------

/** Stat list with optional preview deltas (used while browsing items). */
export function StatList({ stats, preview, keys }: { stats: StatBlock; preview?: StatBlock | null; keys?: Array<keyof StatBlock> }): JSX.Element {
  return (
    <dl className="stat-list">
      {STAT_META.filter((meta) => !keys || keys.includes(meta.key)).map((meta) => {
        const delta = preview ? preview[meta.key] - stats[meta.key] : 0;
        const rounded = Math.round(delta * 100) / 100;
        return (
          <div key={meta.key} className={`stat-row ${rounded > 0 ? 'is-up' : rounded < 0 ? 'is-down' : ''}`} title={meta.help}>
            <dt>{meta.label}</dt>
            <dd>
              {meta.format(preview ? preview[meta.key] : stats[meta.key])}
              {rounded !== 0 && (
                <span className="stat-delta">
                  {rounded > 0 ? '+' : '−'}
                  {meta.key === 'critDamage'
                    ? Math.abs(rounded)
                    : meta.key === 'critChance' || meta.key === 'evasion'
                      ? fmtPercent(Math.abs(rounded))
                      : fmt(Math.abs(rounded))}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function ElementPoints({ scores, empty }: { scores: ElementScores; empty?: string }): JSX.Element | null {
  const entries = elementEntries(scores);
  if (entries.length === 0) {
    return empty ? <p className="muted small">{empty}</p> : null;
  }
  return (
    <span className="element-points">
      {entries.map(([key, value]) => (
        <span key={key} className="element-point" title={`${ELEMENT_LABELS[key] ?? key} element points`}>
          <ElementGem element={key} />
          <b>{fmt(value)}</b>
          <span>{ELEMENT_LABELS[key] ?? key}</span>
        </span>
      ))}
    </span>
  );
}

const ELEMENT_ORDER = ['fire', 'water', 'air', 'earth', 'light', 'dark', 'luxurious', 'gold', 'all'];

export function elementEntries(scores: ElementScores): Array<[string, number]> {
  return Object.entries(scores)
    .filter(([, value]) => value > 0)
    .sort((left, right) => indexOr(ELEMENT_ORDER, left[0]) - indexOr(ELEMENT_ORDER, right[0]));
}

// ---------------------------------------------------------------------------
// Option builders for comboboxes
// ---------------------------------------------------------------------------

export function enchantmentOptions(data: GameData, type: 'Element' | 'Spirit', item?: ItemData): ComboOption[] {
  const affinity = (type === 'Element' ? item?.elementalAffinity : item?.spiritAffinity)?.toLowerCase() ?? '';
  return data.enchantments
    .filter((entry) => entry.type === type)
    .map((entry) => {
      const primary = primaryElement(entry);
      const shortName = entry.name.replace(/\s+(Element|Spirit)$/i, '');
      const matchesAffinity = Boolean(affinity) && (affinity.includes(shortName.toLowerCase()) || affinityMatchesElement(affinity, primary));
      const points = Object.entries(entry.elementScores)
        .map(([key, value]) => `${ELEMENT_LABELS[key] ?? key} ${value}`)
        .join(', ');
      return {
        value: entry.id,
        label: shortName,
        detail: [type === 'Element' ? points : '', matchesAffinity ? '★ matches this item’s affinity' : ''].filter(Boolean).join(' · ') || undefined,
        group: matchesAffinity ? 'Affinity bonus' : type === 'Element' ? 'Elements' : 'Spirits',
        leading: type === 'Element' && primary ? <ElementGem element={primary} size={14} /> : undefined,
        rank: matchesAffinity ? 0 : 1
      };
    })
    .sort((left, right) => left.rank - right.rank)
    .map(({ rank: _rank, ...option }) => option);
}

function primaryElement(entry: EnchantmentData): string {
  return Object.entries(entry.elementScores).sort((left, right) => right[1] - left[1])[0]?.[0] ?? '';
}

function affinityMatchesElement(affinity: string, primary: string): boolean {
  const label = (ELEMENT_LABELS[primary] ?? '').toLowerCase();
  return Boolean(label) && (affinity.includes(label) || affinity.includes('all'));
}

export function skillsFor(data: GameData, hero: HeroData | undefined): SkillData[] {
  return skillsForHero(data, hero).sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name));
}

export function builtInEnchantment(data: GameData, item: ItemData | undefined, type: 'Element' | 'Spirit') {
  return findBuiltInEnchantment(data, item, type);
}

function indexOr(list: string[], value: string): number {
  const index = list.indexOf(value);
  return index === -1 ? 99 : index;
}
