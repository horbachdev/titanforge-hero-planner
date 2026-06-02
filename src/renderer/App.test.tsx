import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the builder and stat surface', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Hero Builder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hero 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Build/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to Main Roster/i })).toBeInTheDocument();
    expect(screen.getByText('Element Points')).toBeInTheDocument();
    expect(screen.getAllByText(/Element None/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Spirit None/i).length).toBeGreaterThan(0);
    expect(screen.getByText('ATK')).toBeInTheDocument();
  });

  it('renders five hero build tabs and a champion build tab', () => {
    render(<App />);

    for (const tab of ['Hero 1', 'Hero 2', 'Hero 3', 'Hero 4', 'Hero 5', 'Champion']) {
      expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
    }
  });

  it('searches imported items in the item database', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Items/i }));
    fireEvent.change(screen.getByPlaceholderText('Search items'), { target: { value: 'Avatar Core' } });

    expect(screen.getByText('Avatar Core')).toBeInTheDocument();
  });

  it('shows roster management and champion controls', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }));

    expect(screen.getByRole('heading', { name: 'Roster' })).toBeInTheDocument();
    expect(screen.getByText('Team Totals')).toBeInTheDocument();
    expect(screen.getByText('Champion aura')).toBeInTheDocument();
    expect(screen.getByText('Element Points')).toBeInTheDocument();
    expect(screen.getByText(/autosaved locally/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeDisabled();
    expect(screen.getByText('Saved Builds')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New Roster/i }));
    expect(screen.getAllByDisplayValue('Roster 2').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Delete/i })).not.toBeDisabled();
  });

  it('shows the champion builder with champion gear controls', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Champion' }));

    expect(screen.getByRole('heading', { name: 'Champion' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Champion Stats' })).toBeInTheDocument();
    expect(screen.getAllByText('Argon').length).toBeGreaterThan(0);
    expect(screen.getByText('Champion Gear')).toBeInTheDocument();
    expect(screen.getAllByText('Familiar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aurasong').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Set for Main Roster/i })).toBeInTheDocument();
    expect(screen.queryByText('Rank Rewards')).not.toBeInTheDocument();
  });
});
