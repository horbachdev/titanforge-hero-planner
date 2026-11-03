import { Lock, Search, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { ITEM_QUALITIES, QUALITY_LABELS } from '../../shared/data-utils';
import { getStarforgeStatMultiplier } from '../../shared/engine';
import type { EquipmentSelection, ItemData, ItemQuality, StatBlock } from '../../shared/types';
import { useGame } from '../data/GameDataContext';
import { ElementGem, ItemGlyph } from './art';
import { Combobox } from './Combobox';
import { builtInEnchantment, enchantmentOptions, fmtSigned, itemStatSummary } from './game';
import { Switch } from './ui';

export function emptySelection(slotId: string): EquipmentSelection {
  return { slotId, itemId: '', quality: 'normal', elementId: '', spiritId: '', starforged: false };
}

/** The selection after swapping in another item, keeping quality and enchants where they still apply. */
export function swapPatch(selection: EquipmentSelection, candidate: ItemData): Partial<EquipmentSelection> {
  return {
    itemId: candidate.id,
    elementId: candidate.builtInElement ? '' : selection.elementId,
    spiritId: candidate.builtInSpirit ? '' : selection.spiritId,
    starforged: selection.starforged && getStarforgeStatMultiplier(candidate) > 1
  };
}

/**
 * Side panel for one equipment slot: configure the equipped item (quality,
 * element, spirit, Starforge) and browse replacements. Every candidate shows
 * what it would change *before* it is equipped.
 */
export function ItemDrawer({
  eyebrow,
  allowedTypes,
  selection,
  maxTier,
  current,
  previewFor,
  onPreview,
  onPatch,
  onClose
}: {
  eyebrow: string;
  allowedTypes: string[];
  selection: EquipmentSelection;
  maxTier: number;
  current: StatBlock;
  previewFor: (patch: Partial<EquipmentSelection>) => StatBlock;
  onPreview: (stats: StatBlock | null) => void;
  onPatch: (patch: Partial<EquipmentSelection>) => void;
  onClose: () => void;
}): JSX.Element {
  const { data, repo } = useGame();
  const item = repo.item(selection.itemId);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [showAll, setShowAll] = useState(false);
  const normalized = normalizeSearch(query);

  const candidates = useMemo(
    () =>
      data.items
        .filter((entry) => allowedTypes.includes(entry.type))
        .filter((entry) => !type || entry.type === type)
        .filter((entry) => showAll || entry.tier <= maxTier)
        .filter(
          (entry) => !normalized || normalizeSearch(`${entry.name} ${entry.type} ${entry.builtInSpirit} ${entry.builtInElement}`).includes(normalized)
        )
        .sort((left, right) => right.tier - left.tier || right.value - left.value)
        .slice(0, 60),
    [data, allowedTypes, type, showAll, maxTier, normalized]
  );

  const previews = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, previewFor(swapPatch(selection, candidate))])),
    // previewFor changes identity every render; selection + current capture what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, selection, current]
  );

  const builtInElement = builtInEnchantment(data, item, 'Element');
  const builtInSpirit = builtInEnchantment(data, item, 'Spirit');

  return (
    <aside className="drawer" role="dialog" aria-label={eyebrow}>
      <header className="drawer-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{allowedTypes.join(' · ')}</h2>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>

      {item && (
        <section className="equipped">
          <div className="equipped-head">
            <ItemGlyph item={item} quality={selection.quality} size="lg" starforged={selection.starforged} />
            <div>
              <strong>{item.name}</strong>
              <small>
                T{item.tier} {item.type} · {itemStatSummary(item.stats) || 'no base stats'}
              </small>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onPatch({ itemId: '', elementId: '', spiritId: '', starforged: false })}
            >
              Unequip
            </button>
          </div>
          <div className="quality-picker" role="radiogroup" aria-label="Quality">
            {ITEM_QUALITIES.map((quality: ItemQuality) => (
              <button
                key={quality}
                type="button"
                role="radio"
                aria-checked={selection.quality === quality}
                className={`quality-chip q-${quality} ${selection.quality === quality ? 'is-active' : ''}`}
                onClick={() => onPatch({ quality })}
                onMouseEnter={() => onPreview(previewFor({ quality }))}
                onMouseLeave={() => onPreview(null)}
              >
                {QUALITY_LABELS[quality]}
              </button>
            ))}
          </div>
          <div className="enchant-row">
            <Combobox
              label="Element"
              value={builtInElement?.id ?? selection.elementId}
              options={enchantmentOptions(data, 'Element', item)}
              onChange={(elementId) => onPatch({ elementId })}
              placeholder="No element"
              clearable
              disabled={Boolean(item.builtInElement)}
              lockedText={item.builtInElement ? `${item.builtInElement} (built-in)` : undefined}
            />
            <Combobox
              label="Spirit"
              value={builtInSpirit?.id ?? selection.spiritId}
              options={enchantmentOptions(data, 'Spirit', item)}
              onChange={(spiritId) => onPatch({ spiritId })}
              placeholder="No spirit"
              clearable
              disabled={Boolean(item.builtInSpirit)}
              lockedText={item.builtInSpirit ? `${item.builtInSpirit} (built-in)` : undefined}
            />
          </div>
          {getStarforgeStatMultiplier(item) > 1 && (
            <Switch
              label={
                <>
                  <Sparkles size={14} /> Starforged
                </>
              }
              description="+25% base ATK, DEF and HP"
              checked={selection.starforged}
              onChange={(starforged) => onPatch({ starforged })}
            />
          )}
        </section>
      )}

      <section className="drawer-browse">
        <h3 className="panel-title">{item ? 'Replace with' : 'Choose an item'}</h3>
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search items</span>
          <input autoFocus={!item} value={query} placeholder="Search…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="filter-chips">
          {allowedTypes.length > 1 && (
            <>
              <button type="button" className={`chip ${type === '' ? 'is-active' : ''}`} onClick={() => setType('')}>
                All
              </button>
              {allowedTypes.map((entry) => (
                <button key={entry} type="button" className={`chip ${type === entry ? 'is-active' : ''}`} onClick={() => setType(entry)}>
                  {entry}
                </button>
              ))}
            </>
          )}
          {maxTier < 99 && (
            <button
              type="button"
              className={`chip chip-toggle ${showAll ? 'is-active' : ''}`}
              onClick={() => setShowAll((value) => !value)}
              title="Items above the tier cap can't be equipped at this level"
            >
              <Lock size={12} /> {showAll ? 'All tiers' : `Up to T${maxTier}`}
            </button>
          )}
        </div>
        <p className="muted small">Hover an item to preview your stats. Sorted by tier.</p>
        <ul className="item-list" onMouseLeave={() => onPreview(null)}>
          {candidates.map((candidate) => {
            const stats = previews.get(candidate.id)!;
            const powerDelta = stats.power - current.power;
            const locked = candidate.tier > maxTier;
            const element = builtInEnchantment(data, candidate, 'Element');
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  className={`item-option ${candidate.id === item?.id ? 'is-current' : ''} ${locked ? 'is-locked' : ''}`}
                  onMouseEnter={() => onPreview(stats)}
                  onFocus={() => onPreview(stats)}
                  onClick={() => {
                    onPatch(swapPatch(selection, candidate));
                    onPreview(null);
                  }}
                >
                  <ItemGlyph item={candidate} quality={selection.quality} size="md" />
                  <span className="item-option-text">
                    <strong>{candidate.name}</strong>
                    <small>
                      T{candidate.tier} {candidate.type}
                      {candidate.builtInSpirit ? ` · ${candidate.builtInSpirit}` : ''}
                      {element && (
                        <>
                          {' · '}
                          <ElementGem element={Object.keys(element.elementScores)[0] ?? 'all'} /> {candidate.builtInElement}
                        </>
                      )}
                    </small>
                    <span className="item-deltas">
                      {deltaChip('HP', stats.hp - current.hp)}
                      {deltaChip('ATK', stats.attack - current.attack)}
                      {deltaChip('DEF', stats.defense - current.defense)}
                    </span>
                  </span>
                  <span className={`item-power ${powerDelta > 0 ? 'is-up' : powerDelta < 0 ? 'is-down' : ''}`}>
                    {candidate.id === item?.id ? 'equipped' : locked ? 'tier locked' : `${fmtSigned(powerDelta)}`}
                    {candidate.id !== item?.id && !locked && <small>power</small>}
                  </span>
                </button>
              </li>
            );
          })}
          {candidates.length === 0 && <li className="muted chooser-empty">Nothing matches.</li>}
        </ul>
      </section>
    </aside>
  );
}

function deltaChip(label: string, delta: number): JSX.Element | null {
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return null;
  }
  return (
    <span className={rounded > 0 ? 'is-up' : 'is-down'}>
      {label} {fmtSigned(rounded)}
    </span>
  );
}
