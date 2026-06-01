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
    expect(screen.getByRole('button', { name: /Save Build/i })).toBeInTheDocument();
    expect(screen.getByText('ATK')).toBeInTheDocument();
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
  });
});
