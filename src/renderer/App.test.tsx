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

function renderApp() {
  return render(<App source={source} />);
}

function seedTeam(): void {
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
        name: 'Farm Team',
        heroBuildIds: [heroes[0].id, heroes[1].id, null, null, null],
        championBuildId: champion.id
      }
    ])
  );
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
  });

  it('guides a first-time player to create a hero and autosaves edits', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Build your first hero' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create a hero' }));
    const name = screen.getByLabelText('Hero name');
    fireEvent.change(name, { target: { value: 'My Tank' } });

    expect(screen.getByRole('button', { name: /My Tank/ })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.heroes) ?? '[]');
    expect(stored[0].name).toBe('My Tank');
  });

  it('equips an item through the searchable picker and updates stats', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Create a hero' }));
    const attackBefore = screen.getByText('Attack').nextElementSibling?.textContent;

    const picker = screen.getByRole('combobox', { name: 'Slot 1 item' });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'sword' } });
    const options = within(screen.getByRole('listbox', { name: 'Slot 1 item' })).getAllByRole('option');
    fireEvent.click(options[0]);

    expect(screen.getByRole('combobox', { name: 'Slot 1 item' })).toHaveValue(options[0].querySelector('.combobox-label')?.textContent);
    expect(screen.getByText('Attack').nextElementSibling?.textContent).not.toBe(attackBefore);
  });

  it('simulates a saved team and explains the result', async () => {
    seedTeam();
    window.location.hash = '#/simulate';
    renderApp();

    expect(await screen.findByText('win rate', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeInTheDocument();
    expect(screen.getByText('Your units')).toBeInTheDocument();
    expect(screen.getAllByText('Tank').length).toBeGreaterThan(0);
  });

  it('recovers an unsaved draft from the old version', async () => {
    const draft = api.evaluateHero({ name: 'Old Draft', heroClass: 'Soldier' }).build;
    localStorage.setItem(STORAGE_KEYS.legacyHeroDraft, JSON.stringify(draft));
    window.location.hash = '#/heroes';
    renderApp();

    expect(await screen.findByRole('button', { name: /Old Draft \(recovered draft\)/ })).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.legacyHeroDraft)).toBeNull();
  });

  it('deletes a hero with undo and keeps team slots intact', async () => {
    seedTeam();
    window.location.hash = '#/heroes';
    renderApp();

    await screen.findByLabelText('Hero name');
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.heroes) ?? '[]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) ?? '[]')[0].heroBuildIds[0]).toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.heroes) ?? '[]')).toHaveLength(2);
    const team = JSON.parse(localStorage.getItem(STORAGE_KEYS.teams) ?? '[]')[0];
    expect(team.heroBuildIds[0]).not.toBeNull();
  });

  it('imports a team suggested by an AI assistant', async () => {
    window.location.hash = '#/data';
    renderApp();
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
    window.location.hash = '#/data';
    renderApp();
    const box = await screen.findByLabelText(/paste JSON/i);
    fireEvent.change(box, { target: { value: JSON.stringify({ heroes: [{ heroClass: 'Soldier', gear: [{ item: 'aegis' }] }] }) } });
    expect(screen.getByText('Can’t import this')).toBeInTheDocument();
    expect(screen.getByText(/Did you mean/)).toBeInTheDocument();
  });
});
