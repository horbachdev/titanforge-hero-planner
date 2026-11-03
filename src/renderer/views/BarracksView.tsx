import { Crown, Plus, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { calculateChampionBuildStats, calculateHeroStats } from '../../shared/engine';
import { ChampionCrest, HeroCrest, ItemGlyph } from '../components/art';
import { buildHero, ElementPoints, fmt } from '../components/game';
import { ChampionTypePicker, ClassPicker } from '../components/pickers';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';

/** The player's collection: heroes and champions as cards. */
export function BarracksView(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<'hero' | 'champion' | null>(null);
  const normalized = normalizeSearch(query);

  const heroes = useMemo(
    () =>
      store.heroes.map((build) => {
        const resolved = calculateHeroStats(build, data);
        return {
          build,
          resolved,
          parties: store.teams.filter((team) => team.heroBuildIds.includes(build.id)).map((team) => team.name)
        };
      }),
    [store.heroes, store.teams, data]
  );
  const champions = useMemo(
    () => store.champions.map((build) => ({ build, resolved: calculateChampionBuildStats(build, data) })),
    [store.champions, data]
  );
  const visibleHeroes = heroes.filter(
    ({ build, resolved }) => !normalized || normalizeSearch(`${build.name} ${resolved.hero?.name ?? ''}`).includes(normalized)
  );

  function recruit(heroClassId: string): void {
    const build = store.createHero(heroClassId);
    setPicking(null);
    store.navigate({ page: 'hero', id: build.id });
  }

  function recruitChampion(championId: string): void {
    const build = store.createChampion(championId);
    setPicking(null);
    store.navigate({ page: 'champion', id: build.id });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your guild</p>
          <h1>Barracks</h1>
        </div>
        <div className="page-actions">
          {store.heroes.length > 6 && (
            <label className="search-field search-compact">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search heroes</span>
              <input value={query} placeholder="Find a hero…" onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setPicking('hero')}>
            <UserPlus size={17} /> Recruit hero
          </button>
        </div>
      </header>

      {store.heroes.length === 0 ? (
        <section className="welcome">
          <div className="welcome-art">
            <HeroCrest hero={repo.hero('soldier')} size="xl" />
            <HeroCrest hero={repo.hero('mage')} size="xl" />
            <HeroCrest hero={repo.hero('thief')} size="xl" />
          </div>
          <h2>Bring your heroes over from the game</h2>
          <p>
            Recruit each hero with the class, level and gear they have in Shop Titans. TitanForge works out their exact stats, and the Quest board
            then shows where your party wins.
          </p>
          <div className="welcome-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setPicking('hero')}>
              <UserPlus size={18} /> Recruit your first hero
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => store.navigate({ page: 'ledger' })}>
              Import a backup or AI build
            </button>
          </div>
        </section>
      ) : (
        <section aria-label="Heroes">
          <h2 className="section-title">
            Heroes <span>{store.heroes.length}</span>
          </h2>
          <div className="card-grid">
            {visibleHeroes.map(({ build, resolved, parties }) => {
              const hero = resolved.hero;
              return (
                <button key={build.id} type="button" className="hero-card" onClick={() => store.navigate({ page: 'hero', id: build.id })}>
                  <span className="hero-card-top">
                    <HeroCrest hero={hero} size="md" />
                    <span className="hero-card-name">
                      <strong>{build.name}</strong>
                      <small>
                        {hero?.name ?? 'Unknown'} · Lv {build.level}
                      </small>
                    </span>
                    <span className="hero-card-power">
                      <b>{fmt(resolved.stats.power)}</b>
                      <small>power</small>
                    </span>
                  </span>
                  <span className="gear-strip" aria-label="Equipment">
                    {(hero?.slots ?? []).map((slot) => {
                      const selection = build.equipment.find((entry) => entry.slotId === slot.id);
                      return (
                        <ItemGlyph
                          key={slot.id}
                          size="sm"
                          item={repo.item(selection?.itemId)}
                          quality={selection?.quality}
                          fallbackType={slot.allowedTypes[0]}
                          starforged={selection?.starforged}
                        />
                      );
                    })}
                  </span>
                  <span className="hero-card-stats">
                    <span>
                      <b>{fmt(resolved.stats.hp)}</b> HP
                    </span>
                    <span>
                      <b>{fmt(resolved.stats.attack)}</b> ATK
                    </span>
                    <span>
                      <b>{fmt(resolved.stats.defense)}</b> DEF
                    </span>
                  </span>
                  <span className="hero-card-foot">
                    <ElementPoints scores={resolved.elementScores} />
                    {parties.length > 0 && <span className="tag">{parties.join(', ')}</span>}
                  </span>
                </button>
              );
            })}
            <button type="button" className="hero-card hero-card-new" onClick={() => setPicking('hero')}>
              <Plus size={22} />
              <span>Recruit hero</span>
            </button>
          </div>
        </section>
      )}

      <section aria-label="Champions">
        <h2 className="section-title">
          Champions <span>{store.champions.length}</span>
        </h2>
        <div className="card-grid">
          {champions.map(({ build, resolved }) => (
            <button key={build.id} type="button" className="hero-card is-champion" onClick={() => store.navigate({ page: 'champion', id: build.id })}>
              <span className="hero-card-top">
                <ChampionCrest champion={resolved.champion} size="md" />
                <span className="hero-card-name">
                  <strong>{build.name}</strong>
                  <small>
                    Rank {build.rank}
                    {build.championSoul ? ' · Soul' : ''}
                  </small>
                </span>
                <span className="hero-card-power">
                  <b>{fmt(resolved.stats.power)}</b>
                  <small>power</small>
                </span>
              </span>
              <span className="aura-text">
                <Crown size={13} /> {resolved.leaderSkill ? resolved.leaderSkill.name : 'No aura at this rank'}
              </span>
              {resolved.leaderSkill && <span className="aura-effect">{resolved.leaderSkill.effect}</span>}
            </button>
          ))}
          <button type="button" className="hero-card hero-card-new" onClick={() => setPicking('champion')}>
            <Plus size={22} />
            <span>Add champion</span>
          </button>
        </div>
      </section>

      {picking === 'hero' && <ClassPicker title="Recruit a hero — choose a class" onPick={recruit} onClose={() => setPicking(null)} />}
      {picking === 'champion' && <ChampionTypePicker onPick={recruitChampion} onClose={() => setPicking(null)} />}
    </div>
  );
}
