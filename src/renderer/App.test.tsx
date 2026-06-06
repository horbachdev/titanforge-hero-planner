import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the create hero workflow with save, load, and reset', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Create Hero' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create Hero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Hero/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByLabelText('Load Hero')).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue('New Build'), { target: { value: 'Roster Hero A' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Hero/i }));

    expect(screen.getByLabelText('Load Hero')).not.toBeDisabled();
    expect(screen.getByText(/1 saved/i)).toBeInTheDocument();
  });

  it('lists saved heroes in the library and edit opens the hero builder', () => {
    render(<App />);

    fireEvent.change(screen.getByDisplayValue('New Build'), { target: { value: 'Edit Me Hero' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Hero/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Edit Me Hero')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Create Hero' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Edit Me Hero')).toBeInTheDocument();
  });

  it('saves champions and exposes them in the library', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Champion' }));
    expect(screen.getByRole('heading', { name: 'Create Champion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Champion/i })).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Champion 1'), { target: { value: 'Roster Champion A' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Champion/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Champions' }));

    expect(screen.getByText('Roster Champion A')).toBeInTheDocument();
  });

  it('builds a roster from saved hero and champion references', () => {
    render(<App />);

    fireEvent.change(screen.getByDisplayValue('New Build'), { target: { value: 'Roster Hero A' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Hero/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Create Champion' }));
    fireEvent.change(screen.getByDisplayValue('Champion 1'), { target: { value: 'Roster Champion A' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Champion/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Roster Management' }));
    expect(screen.getByRole('heading', { name: 'Roster Management' })).toBeInTheDocument();
    expect(screen.getAllByText('Main Roster').length).toBeGreaterThan(0);
    expect(screen.getByText('0 / 5')).toBeInTheDocument();

    const heroSelect = screen.getAllByLabelText('Load Hero')[0] as HTMLSelectElement;
    const heroOption = Array.from(heroSelect.options).find((option) => option.textContent === 'Roster Hero A');
    expect(heroOption).toBeDefined();
    fireEvent.change(heroSelect, { target: { value: heroOption?.value } });

    const championSelect = screen.getByLabelText('Load Champion') as HTMLSelectElement;
    const championOption = Array.from(championSelect.options).find((option) => option.textContent === 'Roster Champion A');
    expect(championOption).toBeDefined();
    fireEvent.change(championSelect, { target: { value: championOption?.value } });

    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    expect(screen.getAllByText('Roster Champion A').length).toBeGreaterThan(0);
  });

  it('opens the quest simulator with the active roster controls', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Quest Simulator' }));

    expect(screen.getByRole('heading', { name: 'Quest Simulator' })).toBeInTheDocument();
    expect(screen.getByLabelText('Roster')).toBeInTheDocument();
    expect(screen.getByLabelText('Quest')).toBeInTheDocument();
    expect(screen.getByLabelText('Defense cap')).toBeInTheDocument();
    expect(screen.getByText('Quick Result')).toBeInTheDocument();
    expect(screen.getAllByText('No roster loaded').length).toBeGreaterThan(0);
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByLabelText('Runs')).toBeInTheDocument();
  });
});
