import type { ChampionData, EnchantmentData, HeroData, ItemData, SkillData } from '../shared/types';

type VisualKind = 'hero' | 'champion' | 'item' | 'skill' | 'element' | 'spirit';

interface VisualTokenProps {
  kind: VisualKind;
  label: string;
  title?: string;
}

export function VisualToken({ kind, label, title }: VisualTokenProps): JSX.Element {
  return (
    <span className={`visual-token visual-token-${kind}`} title={title ?? label} aria-hidden="true">
      {initials(label)}
    </span>
  );
}

export function HeroToken({ hero }: { hero: HeroData | null | undefined }): JSX.Element {
  return <VisualToken kind="hero" label={hero?.name ?? 'Hero'} />;
}

export function ChampionToken({ champion }: { champion: ChampionData | null | undefined }): JSX.Element {
  return <VisualToken kind="champion" label={champion?.name ?? 'Champion'} />;
}

export function ItemToken({ item }: { item: ItemData | null | undefined }): JSX.Element {
  return <VisualToken kind="item" label={item?.type || item?.name || 'Item'} title={item?.name} />;
}

export function SkillToken({ skill }: { skill: SkillData | null | undefined }): JSX.Element {
  return <VisualToken kind="skill" label={skill?.name ?? 'Skill'} />;
}

export function EnchantmentToken({
  enchantment,
  type
}: {
  enchantment: EnchantmentData | null | undefined;
  type: 'element' | 'spirit';
}): JSX.Element {
  return <VisualToken kind={type} label={enchantment?.name ?? type} />;
}

function initials(value: string): string {
  const words = value
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}
