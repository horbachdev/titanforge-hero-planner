import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { calculateChampionBuildStats, calculateHeroStats } from '../../shared/engine';
import type { HeroRole } from '../../shared/types';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';
import { ChampionCrest, ElementGem, elementKey, HeroCrest } from './art';
import { buildHero, fmt } from './game';
import { Dialog } from './ui';

const ROLES: Array<{ role: HeroRole; label: string }> = [
  { role: 'fighter', label: 'Fighters' },
  { role: 'rogue', label: 'Rogues' },
  { role: 'spellcaster', label: 'Spellcasters' }
];

/** Visual class chooser: all base classes as crests, grouped by role. */
export function ClassPicker({
  title,
  currentId,
  onPick,
  onClose
}: {
  title: string;
  currentId?: string;
  onPick: (heroClassId: string) => void;
  onClose: () => void;
}): JSX.Element {
  const { repo } = useGame();
  const [query, setQuery] = useState('');
  const normalized = normalizeSearch(query);
  const classes = repo
    .baseHeroes()
    .filter((hero) => !normalized || normalizeSearch(`${hero.name} ${hero.promotedClassName} ${hero.role}`).includes(normalized));

  return (
    <Dialog title={title} onClose={onClose} wide>
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search classes</span>
        <input autoFocus value={query} placeholder="Search class or promotion…" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {ROLES.map(({ role, label }) => {
        const entries = classes.filter((hero) => hero.role === role);
        if (entries.length === 0) {
          return null;
        }
        return (
          <section key={role} className="picker-section">
            <h3 className={`picker-heading role-text-${role}`}>{label}</h3>
            <div className="class-grid">
              {entries.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  className={`class-option ${hero.id === currentId ? 'is-current' : ''}`}
                  onClick={() => onPick(hero.id)}
                >
                  <HeroCrest hero={hero} size="lg" />
                  <strong>{hero.name}</strong>
                  <small>
                    <ElementGem element={elementKey(hero.element)} /> {hero.element} · → {hero.promotedClassName || '—'}
                  </small>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </Dialog>
  );
}

export function ChampionTypePicker({
  currentId,
  onPick,
  onClose
}: {
  currentId?: string;
  onPick: (championId: string) => void;
  onClose: () => void;
}): JSX.Element {
  const { data } = useGame();
  return (
    <Dialog title="Choose a champion" onClose={onClose} wide>
      <div className="class-grid">
        {data.champions.map((champion) => (
          <button
            key={champion.id}
            type="button"
            className={`class-option ${champion.id === currentId ? 'is-current' : ''}`}
            onClick={() => onPick(champion.id)}
          >
            <ChampionCrest champion={champion} size="lg" />
            <strong>{champion.name}</strong>
            <small>
              <ElementGem element={elementKey(champion.element)} /> {champion.element}
              {champion.guest ? ' · Guest' : ''}
            </small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Picks one of the player's saved heroes (or recruits a new one). */
export function HeroChooser({
  title,
  takenIds,
  onPick,
  onRecruit,
  onClose
}: {
  title: string;
  takenIds: Array<string | null>;
  onPick: (buildId: string) => void;
  onRecruit: () => void;
  onClose: () => void;
}): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const [query, setQuery] = useState('');
  const entries = useMemo(
    () => store.heroes.map((build) => ({ build, hero: buildHero(repo, build), power: calculateHeroStats(build, data).stats.power })),
    [store.heroes, repo, data]
  );
  const normalized = normalizeSearch(query);
  const visible = entries
    .filter(({ build, hero }) => !normalized || normalizeSearch(`${build.name} ${hero?.name ?? ''}`).includes(normalized))
    .sort((left, right) => right.power - left.power);

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onRecruit}>
          <Plus size={16} /> Recruit a new hero
        </button>
      }
    >
      {entries.length > 5 && (
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search heroes</span>
          <input autoFocus value={query} placeholder="Search by name or class…" onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}
      <ul className="chooser-list">
        {visible.map(({ build, hero, power }) => {
          const slot = takenIds.indexOf(build.id);
          return (
            <li key={build.id}>
              <button type="button" className="chooser-option" onClick={() => onPick(build.id)}>
                <HeroCrest hero={hero} size="sm" />
                <span className="chooser-text">
                  <strong>{build.name}</strong>
                  <small>
                    {hero?.name} · Lv {build.level}
                  </small>
                </span>
                {slot !== -1 && <span className="tag">In party · slot {slot + 1}</span>}
                <span className="chooser-power">{fmt(power)}</span>
              </button>
            </li>
          );
        })}
        {entries.length === 0 && <li className="muted chooser-empty">No heroes yet — recruit your first one below.</li>}
        {entries.length > 0 && visible.length === 0 && <li className="muted chooser-empty">No hero matches “{query}”.</li>}
      </ul>
    </Dialog>
  );
}

export function ChampionChooser({
  currentId,
  onPick,
  onRecruit,
  onClose
}: {
  currentId: string;
  onPick: (buildId: string) => void;
  onRecruit: () => void;
  onClose: () => void;
}): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  return (
    <Dialog
      title="Choose your champion"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-ghost" onClick={onRecruit}>
          <Plus size={16} /> Add a new champion
        </button>
      }
    >
      <ul className="chooser-list">
        {store.champions.map((build) => {
          const resolved = calculateChampionBuildStats(build, data);
          return (
            <li key={build.id}>
              <button type="button" className="chooser-option" onClick={() => onPick(build.id)}>
                <ChampionCrest champion={repo.champion(build.championId)} size="sm" />
                <span className="chooser-text">
                  <strong>{build.name}</strong>
                  <small>
                    Rank {build.rank} · {resolved.leaderSkill?.name ?? 'no aura'}
                  </small>
                </span>
                {build.id === currentId && <span className="tag">In party</span>}
                <span className="chooser-power">{fmt(resolved.stats.power)}</span>
              </button>
            </li>
          );
        })}
        {store.champions.length === 0 && <li className="muted chooser-empty">No champions yet.</li>}
      </ul>
    </Dialog>
  );
}
