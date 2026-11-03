import rawGameData from '../../data/generated/game-data.json';
import type { GameData } from '../types';
import { bundledDataSource } from './bundled';
import { GameRepository } from './repository';
import { fallbackDataSource, loadGameData, memoryDataSource, remoteJsonDataSource } from './source';
import { validateGameData } from './validate';

const data = rawGameData as unknown as GameData;

describe('data sources', () => {
  it('loads and validates the bundled data', async () => {
    const loaded = await loadGameData(bundledDataSource());
    expect(loaded.source.kind).toBe('bundled');
    expect(loaded.validation.ok).toBe(true);
    expect(loaded.data.heroes.length).toBeGreaterThan(30);
  });

  it('maps a foreign API payload through transform()', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ payload: data }), { status: 200 }));
    const source = remoteJsonDataSource('https://example.test/api/v1/game', {
      kind: 'api',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      transform: (body) => (body as { payload: GameData }).payload
    });
    const loaded = await loadGameData(source);
    expect(loaded.source.kind).toBe('api');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('falls back when the primary source fails or returns broken data', async () => {
    const broken = memoryDataSource({ ...data, items: data.items.slice(0, 10) }, { id: 'broken', label: 'Broken API' });
    const offline = remoteJsonDataSource('https://example.test/data.json', {
      fetchImpl: (async () => new Response('nope', { status: 503, statusText: 'Service Unavailable' })) as unknown as typeof fetch
    });
    const loaded = await loadGameData(fallbackDataSource(offline, broken, memoryDataSource(data, { id: 'good', label: 'Good' })));
    expect(loaded.source.id).toBe('good');
    expect(loaded.failures.map((failure) => failure.source.label)).toEqual(['Online data', 'Broken API']);
    expect(loaded.failures[0].error).toContain('503');
    expect(loaded.failures[1].error).toContain('items');
  });

  it('rejects data with dangling references', () => {
    const report = validateGameData({
      ...data,
      heroes: data.heroes.map((hero, index) => (index === 0 ? { ...hero, innateSkillIds: ['does-not-exist'] } : hero))
    });
    expect(report.ok).toBe(false);
    expect(report.errors[0].message).toContain('does-not-exist');
  });
});

describe('GameRepository', () => {
  const repo = new GameRepository(data);

  it('resolves renamed ids through aliases', () => {
    expect(repo.item('otherwordly-chime')?.name).toBe('Otherworldly Chime');
    expect(repo.canonicalId('item', 'otherwordly-chime')).toBe('otherworldly-chime');
  });

  it('resolves forgiving names and refuses to guess between several matches', () => {
    const exact = repo.resolve('hero', 'soldier');
    expect(exact.entity?.id).toBe('soldier');

    const normalized = repo.resolve('item', 'kiku ichimonji');
    expect(normalized.entity?.name).toBe('Kiku-Ichimonji');

    const ambiguous = repo.resolve('item', 'sword');
    expect(ambiguous.entity).toBeNull();
    if (!ambiguous.entity) {
      expect(ambiguous.suggestions.length).toBeGreaterThan(1);
    }
  });

  it('ranks prefix matches first in search', () => {
    const results = repo.search('hero', 'mer');
    expect(results[0]?.name).toBe('Mercenary');
  });

  it('knows the tier cap per level', () => {
    expect(repo.maxTierForLevel(1)).toBeGreaterThanOrEqual(1);
    expect(repo.maxTierForLevel(50)).toBeGreaterThan(repo.maxTierForLevel(1));
  });
});
