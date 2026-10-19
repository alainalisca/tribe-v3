import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
vi.mock('@/components/LanguageToggle', () => ({ default: () => null }));
vi.mock('@/components/NotificationBell', () => ({ default: () => null }));
vi.mock('@/components/TribeOSQuickAccess', () => ({ default: () => null }));
vi.mock('@/components/WhatsNewBadge', () => ({ default: () => null }));
vi.mock('@/components/AdminQuickAccess', () => ({ default: () => null }));

import FeedHeader from './FeedHeader';

/** T-UI-FD1: one filter row (sport chips and Gratis); search opens in place of it. */
function header(over: Partial<React.ComponentProps<typeof FeedHeader>> = {}) {
  const props = {
    sports: ['CrossFit', 'Yoga', 'Boxing'],
    selectedSport: '',
    onSportChange: vi.fn(),
    freeOnly: false,
    onFreeOnlyChange: vi.fn(),
    searchQuery: '',
    onSearchChange: vi.fn(),
    language: 'es' as const,
    onFixedHeightChange: vi.fn(),
    ...over,
  };
  render(<FeedHeader {...props} />);
  return props;
}

describe('FeedHeader', () => {
  it('one row: search, Todos, the sports on the feed (in Spanish), Gratis; no dropdowns or barrio pills', () => {
    header();
    const row = screen.getByTestId('feed-filter-row');
    expect(
      within(row)
        .getAllByRole('button')
        .map((b) => b.textContent || b.getAttribute('aria-label'))
    ).toEqual(['Buscar', 'Todos', 'CrossFit', 'Yoga', 'Boxeo', 'Gratis']);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('El Poblado')).not.toBeInTheDocument();
  });

  it('a sport chip filters, and tapping it again clears it; Gratis toggles', () => {
    const p = header({ selectedSport: 'Yoga' });
    fireEvent.click(screen.getByRole('button', { name: 'Yoga' }));
    expect(p.onSportChange).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: 'Boxeo' }));
    expect(p.onSportChange).toHaveBeenCalledWith('Boxing');
    fireEvent.click(screen.getByRole('button', { name: 'Gratis' }));
    expect(p.onFreeOnlyChange).toHaveBeenCalledWith(true);
  });

  it('search opens in place of the chips, and closing it clears the query', () => {
    const p = header();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'yoga' } });
    expect(p.onSearchChange).toHaveBeenCalledWith('yoga');
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }));
    expect(p.onSearchChange).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
  });
});
