import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import rawGameData from '../data/generated/game-data.json';
import { createPlannerApi } from '../shared/api/planner';
import { GameRepository } from '../shared/data/repository';
import { memoryDataSource } from '../shared/data/source';
import type { GameData } from '../shared/types';
import { App } from './App';
import { STORAGE_KEYS } from './state/storage';

const data = rawGameData as unknown as GameData;
const source = memoryDataSource(data);
const api = createPlannerApi(new GameRepository(data));

function renderApp(hash = '') {
  window.location.hash = hash;
  return render(<App source={source} />);
}

function seedParty(): { tankId: string } {
  const heroes = [
    api.evaluateHero({ name: 'Tank', heroClass: 'Mercenary', level: 40 }).build,
    api.evaluateHero({ name: 'Caster', heroClass: 'Mage', level: 40 }).build
  ];
  const champion = api.evaluateChampion({ champion: 'Argon' }).build;
  localStorage.setItem(STORAGE_KEYS.heroes, JSON.stringify(heroes));
  localStorage.setItem(STORAGE_KEYS.champions, JSON.stringify([champion]));
  localStorage.setItem(
    STORAGE_KEYS.teams,
    JSON.stringify([
      {
        schemaVersion: 1,
        id: 'team-1',
        name: 'Farm Party',
        heroBuildIds: [heroes[0].id, heroes[1].id, null, null, null],
        championBuildId: champion.id
      }
    ])
  );
  return { tankId: heroes[0].id };
}

const storedHeroes = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEYS.heroes) ?? '[]') as Array<{ name: string; equipment: Array<{ itemId: string }> }>;

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('welcomes a new player and recruits a hero by class', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Bring your heroes over from the game' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Recruit your first hero/ }));
    const dialog = screen.getByRole('dialog', { name: /choose a class/ });
    fireEvent.click(within(dialog).getByRole('button', { name: /Samurai/ }));

    const name = await screen.findByLabelText('Hero name');
    expect(name).toHaveValue('Samurai');
    fireEvent.change(name, { target: { value: 'Kenji' } });
    expect(storedHeroes()[0].name).toBe('Kenji');
  });

  it('equips an item from the slot drawer and previews stats on hover', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: /Recruit your first hero/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Soldier/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Slot 1: empty' }));
    const drawer = screen.getByRole('dialog', { name: 'Slot 1' });
    const options = within(drawer)
      .getAllByRole('button')
      .filter((button) => button.classList.contains('item-option'));

    fireEvent.mouseEnter(options[0]);
    expect(screen.getByText(/Previewing/)).toBeInTheDocument();

    fireEvent.click(options[0]);
    expect(storedHeroes()[0].equipment[0].itemId).not.toBe('');
    expect(within(drawer).getByRole('radiogroup', { name: 'Quality' })).toBeInTheDocument();
  });

  it('shows win chances on the quest board and explains a selected quest', async () => {
    seedParty();
    renderApp('#/quests');

    expect(await screen.findByRole('heading', { name: 'Pick a quest' })).toBeInTheDocument();
    const cell = await screen.findByRole('cell', { name: /Howling Woods Normal Easy: \d+% win chance/ }, { timeout: 15000 });
    fireEvent.click(cell);

    expect(await screen.findByText('win chance', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Howling Woods' })).toBeInTheDocument();
    expect(screen.getByText('Your units')).toBeInTheDocument();
  }, 20000);

  it('recovers an unsaved draft from v0.1', async () => {
    const draft = api.evaluateHero({ name: 'Old Draft', heroClass: 'Soldier' }).build;
    localStorage.setItem(STORAGE_KEYS.legacyHeroDraft, JSON.stringify(draft));
    renderApp('#/barracks');

    expect(await screen.findByText('Old Draft (recovered draft)')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.legacyHeroDraft)).toBeNull();
  });

  it('deletes a hero with undo and restores the party slot', async () => {
    const { tankId } = seedParty();
    renderApp(`#/hero/${tankId}`);

    await screen.findByLabelText('Hero name');
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(storedHeroes()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) ?? '[]')[0].heroBuildIds[0]).toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(storedHeroes()).toHaveLength(2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) ?? '[]')[0].heroBuildIds[0]).toBe(tankId);
  });

  it('imports a team suggested by an AI assistant', async () => {
    renderApp('#/ledger');
    const box = await screen.findByLabelText(/paste JSON/i);
    fireEvent.change(box, {
      target: {
        value: JSON.stringify({
          name: 'AI Team',
          heroes: [{ heroClass: 'Samurai', level: 30 }, { heroClass: 'Cleric' }],
          champion: { champion: 'Argon' }
        })
      }
    });

    expect(screen.getByText(/Ready to import 2 heroes, 1 champion, 1 team/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) ?? '[]').some((team: { name: string }) => team.name === 'AI Team')).toBe(true);
  });

  it('explains import errors with suggestions', async () => {
    renderApp('#/ledger');
    const box = await screen.findByLabelText(/paste JSON/i);
    fireEvent.change(box, { target: { value: JSON.stringify({ heroes: [{ heroClass: 'Soldier', gear: [{ item: 'aegis' }] }] }) } });
    expect(screen.getByText('Can’t import this')).toBeInTheDocument();
    expect(screen.getByText(/Did you mean/)).toBeInTheDocument();
  });
});
