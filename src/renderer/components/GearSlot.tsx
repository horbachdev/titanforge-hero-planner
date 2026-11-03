import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { ITEM_QUALITIES, QUALITY_LABELS } from '../../shared/data-utils';
import { getStarforgeStatMultiplier } from '../../shared/engine';
import type { EquipmentSelection, ItemQuality, ResolvedGearLine } from '../../shared/types';
import { useGame } from '../data/GameDataContext';
import { Combobox } from './Combobox';
import { builtInEnchantment, ElementChips, enchantmentOptions, fmtPercent, itemOptions, itemStatSummary } from './game';
import { Segmented, Switch } from './ui';

/**
 * One equipment slot: item first, then (only once an item is chosen) the
 * details that modify it. Built-in enchantments are shown as fixed values
 * instead of a disabled dropdown that silently does nothing.
 */
export function GearSlot({
  index,
  title,
  allowedTypes,
  selection,
  resolved,
  maxTier,
  onChange
}: {
  index?: number;
  title: string;
  allowedTypes: string[];
  selection: EquipmentSelection;
  resolved: ResolvedGearLine | undefined;
  maxTier: number;
  onChange: (patch: Partial<EquipmentSelection>) => void;
}): JSX.Element {
  const { data, repo } = useGame();
  const item = repo.item(selection.itemId);
  const options = useMemo(() => itemOptions(data, allowedTypes, maxTier), [data, allowedTypes, maxTier]);
  const elementOptions = useMemo(() => enchantmentOptions(data, 'Element', item), [data, item]);
  const spiritOptions = useMemo(() => enchantmentOptions(data, 'Spirit', item), [data, item]);
  const builtInElement = builtInEnchantment(data, item, 'Element');
  const builtInSpirit = builtInEnchantment(data, item, 'Spirit');
  const canStarforge = item ? getStarforgeStatMultiplier(item) > 1 : false;
  const label = index !== undefined ? `Slot ${index + 1}` : title;

  function selectItem(itemId: string): void {
    const next = repo.item(itemId);
    onChange({
      itemId,
      elementId: next && !next.builtInElement ? selection.elementId : '',
      spiritId: next && !next.builtInSpirit ? selection.spiritId : '',
      starforged: next && getStarforgeStatMultiplier(next) > 1 ? selection.starforged : false
    });
  }

  const spiritEffects = resolved ? spiritEffectText(resolved) : '';

  return (
    <article className={`gear-slot ${item ? 'is-filled' : 'is-empty'}`}>
      <header className="gear-slot-header">
        <span className="gear-slot-index">{label}</span>
        <span className="gear-slot-types" title={allowedTypes.join(', ')}>
          {allowedTypes.join(' · ')}
        </span>
      </header>

      <Combobox
        label={`${label} item`}
        hideLabel
        value={selection.itemId}
        options={options}
        onChange={selectItem}
        placeholder={`Choose ${allowedTypes.length === 1 ? allowedTypes[0].toLowerCase() : 'item'}…`}
        clearable
        emptyText={`No ${allowedTypes.join('/')} up to T${maxTier}`}
      />

      {item && (
        <>
          <Segmented<ItemQuality>
            label={`Quality · ${QUALITY_LABELS[selection.quality]}`}
            size="sm"
            value={selection.quality}
            onChange={(quality) => onChange({ quality })}
            options={ITEM_QUALITIES.map((quality) => ({
              value: quality,
              label: QUALITY_LABELS[quality].charAt(0),
              title: QUALITY_LABELS[quality],
              className: `quality-${quality}`
            }))}
          />
          <div className="gear-slot-enchants">
            <Combobox
              label="Element"
              value={builtInElement?.id ?? selection.elementId}
              options={elementOptions}
              onChange={(elementId) => onChange({ elementId })}
              placeholder="No element"
              clearable
              disabled={Boolean(item.builtInElement)}
              lockedText={item.builtInElement ? `${item.builtInElement} (built-in)` : undefined}
            />
            <Combobox
              label="Spirit"
              value={builtInSpirit?.id ?? selection.spiritId}
              options={spiritOptions}
              onChange={(spiritId) => onChange({ spiritId })}
              placeholder="No spirit"
              clearable
              disabled={Boolean(item.builtInSpirit)}
              lockedText={item.builtInSpirit ? `${item.builtInSpirit} (built-in)` : undefined}
            />
          </div>
          {canStarforge && (
            <Switch
              label={
                <>
                  <Sparkles size={14} /> Starforged
                </>
              }
              description="+25% base ATK, DEF and HP"
              checked={selection.starforged}
              onChange={(starforged) => onChange({ starforged })}
            />
          )}
          {resolved && (
            <footer className="gear-slot-result">
              <span className="gear-slot-stats">{itemStatSummary(resolved.stats) || 'No stats'}</span>
              {spiritEffects && <span className="gear-slot-spirit">{spiritEffects}</span>}
              <ElementChips scores={resolved.elementScores} />
              {resolved.affinityBonuses.length > 0 && <span className="gear-slot-affinity">★ {resolved.affinityBonuses.join(' · ')}</span>}
              {resolved.warnings.map((warning) => (
                <span key={warning} className="gear-slot-warning">
                  {warning}
                </span>
              ))}
            </footer>
          )}
        </>
      )}
    </article>
  );
}

function spiritEffectText(line: ResolvedGearLine): string {
  const parts: string[] = [];
  const pct = (value: number) => `+${fmtPercent(value * 100)}`;
  const { spiritModifiers: m, spiritFlatStats: f } = line;
  if (m.attack) parts.push(`${pct(m.attack)} ATK`);
  if (m.defense) parts.push(`${pct(m.defense)} DEF`);
  if (m.hp) parts.push(`${pct(m.hp)} HP`);
  if (m.critChance) parts.push(`${pct(m.critChance)} CRIT`);
  if (m.critDamage) parts.push(`${pct(m.critDamage)} CDMG`);
  if (m.evasion) parts.push(`${pct(m.evasion)} EVA`);
  if (f.attack) parts.push(`+${f.attack} ATK`);
  if (f.defense) parts.push(`+${f.defense} DEF`);
  if (f.hp) parts.push(`+${f.hp} HP`);
  if (f.threat) parts.push(`+${f.threat} Threat`);
  return parts.length > 0 ? `Spirit: ${parts.join(', ')} (whole hero)` : '';
}
