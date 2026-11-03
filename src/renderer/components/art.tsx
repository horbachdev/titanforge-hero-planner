import {
  Anvil,
  ArrowUpRight,
  Axe,
  Biohazard,
  Bomb,
  BookOpen,
  CakeSlice,
  CircleDot,
  Crosshair,
  Cross,
  Crown,
  Drama,
  Drumstick,
  Feather,
  Flame,
  FlaskConical,
  Footprints,
  Gem,
  GraduationCap,
  Hammer,
  Hand,
  HardHat,
  Hourglass,
  Landmark,
  Leaf,
  Map as MapIcon,
  Mountain,
  Music,
  Orbit,
  Package,
  PawPrint,
  Pickaxe,
  Ribbon,
  Shield,
  ShieldHalf,
  Shirt,
  Skull,
  Slice,
  Sparkles,
  Sprout,
  Sword,
  Swords,
  Target,
  VenetianMask,
  Wand,
  WandSparkles,
  Zap,
  type LucideIcon
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ChampionData, HeroData, HeroRole, ItemData, ItemQuality } from '../../shared/types';

/**
 * Game art drawn in code: class crests, item glyphs, element gems and the
 * win-chance gauge. No external assets needed (Kabam's fan kit could replace
 * these later without touching the layout).
 */

const CLASS_ICONS: Record<string, LucideIcon> = {
  soldier: Sword,
  barbarian: Axe,
  knight: Shield,
  ranger: Crosshair,
  samurai: Swords,
  berserker: Flame,
  'dark-knight': Skull,
  thief: VenetianMask,
  monk: Hand,
  musketeer: Bomb,
  wanderer: MapIcon,
  ninja: Zap,
  dancer: Music,
  velite: ShieldHalf,
  mage: WandSparkles,
  cleric: Cross,
  druid: Leaf,
  sorcerer: Orbit,
  spellblade: Sparkles,
  geomancer: Mountain,
  chronomancer: Hourglass
};

const ROLE_ICONS: Record<string, LucideIcon> = { fighter: Sword, rogue: VenetianMask, spellcaster: WandSparkles, champion: Crown };

type CrestSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Hexagonal class emblem. Role sets the colour, class sets the symbol. */
export function Crest({
  role,
  classId,
  size = 'md',
  promoted = false,
  title
}: {
  role: HeroRole | 'champion' | undefined;
  classId?: string;
  size?: CrestSize;
  promoted?: boolean;
  title?: string;
}): JSX.Element {
  const Icon = (classId && CLASS_ICONS[classId]) || ROLE_ICONS[role ?? ''] || Sparkles;
  return (
    <span
      className={`crest crest-${size} role-${role ?? 'unknown'} ${promoted ? 'is-promoted' : ''}`}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 100 110" className="crest-shape" aria-hidden="true">
        <path d="M50 3 L95 28 L95 82 L50 107 L5 82 L5 28 Z" />
      </svg>
      <Icon className="crest-icon" strokeWidth={1.8} />
    </span>
  );
}

export function HeroCrest({ hero, size }: { hero: HeroData | null | undefined; size?: CrestSize }): JSX.Element {
  return <Crest role={hero?.role} classId={hero?.baseClassId} promoted={hero?.promoted} size={size} title={hero?.name} />;
}

export function ChampionCrest({ champion, size }: { champion: ChampionData | null | undefined; size?: CrestSize }): JSX.Element {
  return <Crest role="champion" size={size} title={champion?.name} />;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  Sword,
  Axe,
  Dagger: Slice,
  Mace: Hammer,
  Spear: ArrowUpRight,
  Bow: Target,
  Staff: Wand,
  Wand: WandSparkles,
  Crossbow: Crosshair,
  Gun: Bomb,
  Instrument: Music,
  'Dual Wield': Swords,
  Catalyst: Orbit,
  Scythe: Pickaxe,
  'Herbal Medicine': Sprout,
  Potion: FlaskConical,
  Spell: BookOpen,
  'Heavy Armor': Shirt,
  'Light Armor': Shirt,
  Clothes: Shirt,
  Helmet: HardHat,
  'Rogue Hat': HardHat,
  'Magician Hat': GraduationCap,
  Mask: Drama,
  Gauntlets: Hand,
  Gloves: Hand,
  'Heavy Footwear': Footprints,
  'Light Footwear': Footprints,
  Shield,
  Quiver: Feather,
  Cloak: Ribbon,
  Idol: Landmark,
  Ring: CircleDot,
  Amulet: Gem,
  Familiar: PawPrint,
  Meal: Drumstick,
  Dessert: CakeSlice,
  Aurasong: Music,
  Runestone: Biohazard,
  Moonstone: Gem
};

export function typeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Package;
}

/** Square item tile: type glyph, quality frame, tier badge. Empty tiles show the slot's main type faintly. */
export function ItemGlyph({
  item,
  quality = 'normal',
  fallbackType,
  size = 'md',
  starforged
}: {
  item?: ItemData | null;
  quality?: ItemQuality;
  fallbackType?: string;
  size?: 'sm' | 'md' | 'lg';
  starforged?: boolean;
}): JSX.Element {
  const Icon = typeIcon(item?.type ?? fallbackType ?? '');
  return (
    <span className={`glyph glyph-${size} ${item ? `q-${quality}` : 'is-empty'}`} aria-hidden="true">
      <Icon className="glyph-icon" strokeWidth={1.6} />
      {item && <span className="glyph-tier">{item.tier}</span>}
      {starforged && <Sparkles className="glyph-star" size={11} />}
    </span>
  );
}

export const ELEMENT_COLORS: Record<string, string> = {
  fire: '#ff7a45',
  water: '#4aa8ff',
  air: '#8fe3d0',
  earth: '#a3cf4f',
  light: '#ffe07a',
  dark: '#b583ff',
  luxurious: '#ffc94a',
  gold: '#ffc94a',
  all: '#efe7da',
  any: '#efe7da'
};

/** Small faceted gem in the element's colour. */
export function ElementGem({ element, size = 12 }: { element: string; size?: number }): JSX.Element {
  const color = ELEMENT_COLORS[element.toLowerCase()] ?? '#c9bfb1';
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="gem" aria-hidden="true" style={{ '--gem': color } as CSSProperties}>
      <path d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z" fill={color} />
      <path d="M6 0.5 L11.5 6 L6 6 Z" fill="rgba(255,255,255,0.35)" />
      <path d="M0.5 6 L6 11.5 L6 6 Z" fill="rgba(0,0,0,0.25)" />
    </svg>
  );
}

/** Element name → key used by ELEMENT_COLORS ("Gold" → luxurious etc.). */
export function elementKey(name: string): string {
  const key = name.toLowerCase().trim();
  return key === 'gold' ? 'luxurious' : key;
}

/** Circular win-chance gauge. */
export function Gauge({ value, size = 140, tone }: { value: number; size?: number; tone: string }): JSX.Element {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const display = clamped % 1 === 0 || clamped >= 99.95 || clamped < 0.05 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  return (
    <span className={`gauge tone-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} className="gauge-track" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="gauge-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="gauge-label">
        <strong>
          {display}
          <small>%</small>
        </strong>
        <span>win chance</span>
      </span>
    </span>
  );
}

/** Background colour for a win-rate heatmap cell. */
export function heatColor(winRate: number): string {
  if (winRate >= 99.5) return 'var(--heat-5)';
  if (winRate >= 90) return 'var(--heat-4)';
  if (winRate >= 60) return 'var(--heat-3)';
  if (winRate >= 25) return 'var(--heat-2)';
  if (winRate > 0) return 'var(--heat-1)';
  return 'var(--heat-0)';
}

export function BrandMark(): JSX.Element {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Anvil size={18} strokeWidth={2} />
    </span>
  );
}
