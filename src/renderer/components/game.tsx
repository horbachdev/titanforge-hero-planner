import type { ReactNode } from 'react';
import { ELEMENT_LABELS } from '../../shared/team';
import { findBuiltInEnchantment, skillsForHero } from '../../shared/catalog';
import { QUALITY_LABELS } from '../../shared/data-utils';
import type { GameRepository } from '../../shared/data/repository';
import type {
  BuildConfig,
  ChampionData,
  ElementScores,
  EnchantmentData,
  GameData,
  HeroData,
  HeroRole,
  ItemData,
  ItemQuality,
  ItemStats,
  SkillData,
  StatBlock
} from '../../shared/types';
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

// ---------------------------------------------------------------------------
// Visual atoms
// ---------------------------------------------------------------------------

export function Avatar({ name, role, size = 'md' }: { name: string; role?: HeroRole | 'champion'; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  return (
    <span className={`avatar avatar-${size} role-${role ?? 'unknown'}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function HeroAvatar({ hero, size }: { hero: HeroData | null | undefined; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  return <Avatar name={hero?.name ?? '?'} role={hero?.role} size={size} />;
}

export function ChampionAvatar({ champion, size }: { champion: ChampionData | null | undefined; size?: 'sm' | 'md' | 'lg' }): JSX.Element {
  return <Avatar name={champion?.name ?? '?'} role="champion" size={size} />;
}

export function RoleLabel({ role }: { role: HeroRole | string }): JSX.Element {
  return <span className={`role-label role-${role}`}>{role === 'spellcaster' ? 'Spellcaster' : role.charAt(0).toUpperCase() + role.slice(1)}</span>;
}

export function PowerBadge({ value, size = 'md' }: { value: number; size?: 'md' | 'lg' }): JSX.Element {
  return (
    <span className={`power-badge power-${size}`} title="Hero power as shown in game">
      <span className="power-label">Power</span>
      <strong>{fmt(value)}</strong>
    </span>
  );
}

export function StatGrid({
  stats,
  compact = false,
  keys
}: {
  stats: StatBlock;
  compact?: boolean;
  /** Limit to these stats (e.g. team totals, where summed percentages are meaningless). */
  keys?: Array<keyof StatBlock>;
}): JSX.Element {
  return (
    <dl className={`stat-grid ${compact ? 'stat-grid-compact' : ''}`}>
      {STAT_META.filter((meta) => !keys || keys.includes(meta.key)).map((meta) => (
        <div key={meta.key} className={`stat stat-${meta.key}`} title={meta.help}>
          <dt>{compact ? meta.short : meta.label}</dt>
          <dd>{meta.format(stats[meta.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatLine({ stats }: { stats: Pick<StatBlock, 'hp' | 'attack' | 'defense'> }): JSX.Element {
  return (
    <span className="stat-line">
      <span title="Health">
        <b>HP</b> {fmt(stats.hp)}
      </span>
      <span title="Attack">
        <b>ATK</b> {fmt(stats.attack)}
      </span>
      <span title="Defense">
        <b>DEF</b> {fmt(stats.defense)}
      </span>
    </span>
  );
}

export function ElementChips({ scores, empty }: { scores: ElementScores; empty?: ReactNode }): JSX.Element | null {
  const entries = elementEntries(scores);
  if (entries.length === 0) {
    return empty ? <span className="muted">{empty}</span> : null;
  }
  return (
    <span className="element-chips">
      {entries.map(([key, value]) => (
        <span key={key} className={`element-chip element-${key}`} title={`${ELEMENT_LABELS[key] ?? key} element points`}>
          {ELEMENT_LABELS[key] ?? key} <b>{fmt(value)}</b>
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

export function QualityTag({ quality }: { quality: ItemQuality }): JSX.Element {
  return <span className={`quality-tag quality-${quality}`}>{QUALITY_LABELS[quality]}</span>;
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
// Option builders for comboboxes
// ---------------------------------------------------------------------------

const ROLE_GROUP: Record<string, string> = { fighter: 'Fighters', rogue: 'Rogues', spellcaster: 'Spellcasters' };

export function heroClassOptions(data: GameData): ComboOption[] {
  return data.heroes
    .filter((hero) => !hero.promoted)
    .sort((left, right) => roleRank(left.role) - roleRank(right.role) || left.name.localeCompare(right.name))
    .map((hero) => ({
      value: hero.id,
      label: hero.name,
      detail: hero.promotedClassName ? `Promotes to ${hero.promotedClassName}` : undefined,
      keywords: `${hero.promotedClassName} ${hero.role}`,
      group: ROLE_GROUP[hero.role] ?? 'Other',
      leading: <Avatar name={hero.name} role={hero.role} size="sm" />
    }));
}

export function itemOptions(data: GameData, allowedTypes: string[], maxTier: number): ComboOption[] {
  const types = new Set(allowedTypes);
  return data.items
    .filter((item) => types.has(item.type) && item.tier <= maxTier)
    .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name))
    .map((item) => ({
      value: item.id,
      label: item.name,
      detail: `T${item.tier} ${item.type}${statsSuffix(item)}${item.builtInSpirit ? ` · ${item.builtInSpirit}` : ''}`,
      keywords: `t${item.tier} ${item.builtInElement}`,
      leading: <span className={`tier-badge tier-${Math.min(item.tier, 16)}`}>T{item.tier}</span>
    }));
}

function statsSuffix(item: ItemData): string {
  const summary = itemStatSummary(item.stats);
  return summary ? ` · ${summary}` : '';
}

export function enchantmentOptions(data: GameData, type: 'Element' | 'Spirit', item?: ItemData): ComboOption[] {
  const affinity = (type === 'Element' ? item?.elementalAffinity : item?.spiritAffinity)?.toLowerCase() ?? '';
  return data.enchantments
    .filter((entry) => entry.type === type)
    .map((entry) => {
      const points = Object.entries(entry.elementScores)
        .map(([key, value]) => `${ELEMENT_LABELS[key] ?? key} ${value}`)
        .join(', ');
      const shortName = entry.name.replace(/\s+(Element|Spirit)$/i, '');
      const matchesAffinity = affinity && (affinity.includes(shortName.toLowerCase()) || affinityMatchesElement(affinity, entry));
      return {
        value: entry.id,
        label: shortName,
        detail: [type === 'Element' ? points : '', matchesAffinity ? '★ matches item affinity' : ''].filter(Boolean).join(' · ') || undefined,
        group: matchesAffinity ? 'Affinity bonus' : type === 'Element' ? 'Elements' : 'Spirits',
        _rank: matchesAffinity ? 0 : 1
      };
    })
    .sort((left, right) => left._rank - right._rank)
    .map(({ _rank: _unused, ...option }) => option);
}

function affinityMatchesElement(affinity: string, entry: EnchantmentData): boolean {
  const [primary] = Object.entries(entry.elementScores).sort((left, right) => right[1] - left[1])[0] ?? [];
  const label = (ELEMENT_LABELS[primary ?? ''] ?? '').toLowerCase();
  return Boolean(label) && (affinity.includes(label) || affinity.includes('all'));
}

export function skillOptions(data: GameData, hero: HeroData | undefined, taken: string[]): ComboOption[] {
  return skillsForHero(data, hero)
    .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name))
    .map((skill: SkillData) => ({
      value: skill.id,
      label: skill.name,
      detail: skill.effect,
      disabled: taken.includes(skill.id),
      group: skill.classes.length > 0 && !/all classes/i.test(skill.classes.join()) ? 'Class skills' : 'General skills',
      leading: <span className="tier-badge">T{skill.tier}</span>
    }))
    .sort((left, right) => (left.group === right.group ? 0 : left.group === 'Class skills' ? -1 : 1));
}

export function builtInEnchantment(data: GameData, item: ItemData | undefined, type: 'Element' | 'Spirit') {
  return findBuiltInEnchantment(data, item, type);
}

// ---------------------------------------------------------------------------

function initials(value: string): string {
  const words = value
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function roleRank(role: HeroRole): number {
  return ['fighter', 'rogue', 'spellcaster'].indexOf(role) + 1 || 9;
}

function indexOr(list: string[], value: string): number {
  const index = list.indexOf(value);
  return index === -1 ? 99 : index;
}
