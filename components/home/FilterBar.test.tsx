import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from './FilterBar';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/components/LanguageToggle', () => ({
  default: () => <div data-testid="lang-toggle" />,
}));

vi.mock('@/lib/translations', () => ({
  sportTranslations: {
    Running: { es: 'Correr' },
    Soccer: { es: 'Fútbol' },
    Basketball: { es: 'Baloncesto' },
  },
  TranslationKey: {},
}));

function createDefaultProps(overrides = {}) {
  return {
    searchQuery: '',
    setSearchQuery: vi.fn(),
    selectedSport: '',
    setSelectedSport: vi.fn(),
    dateFilter: 'all',
    setDateFilter: vi.fn(),
    genderFilter: 'all',
    setGenderFilter: vi.fn(),
    maxDistance: 50,
    setMaxDistance: vi.fn(),
    userLocation: null,
    loading: false,
    filteredCount: 5,
    language: 'en' as const,
    t: (key: string) => {
      const map: Record<string, string> = {
        searchPlaceholder: 'Search sessions...',
        clearAll: 'Clear all',
        sport: 'Sport',
        date: 'Date',
        today: 'Today',
        week: 'Week',
        month: 'Month',
        all: 'All',
        women: 'Women',
        men: 'Men',
        dist: 'Dist.',
      };
      return map[key] || key;
    },
    onFixedHeightChange: vi.fn(),
    ...overrides,
  };
}

describe('FilterBar', () => {
  it('renders search input with enterKeyHint="search"', () => {
    render(<FilterBar {...createDefaultProps()} />);
    const input = screen.getByPlaceholderText('Search sessions...');
    expect(input).toBeInTheDocument();
    expect(input.getAttribute('enterKeyHint')).toBe('search');
  });

  it('renders search input with autoComplete="off"', () => {
    render(<FilterBar {...createDefaultProps()} />);
    const input = screen.getByPlaceholderText('Search sessions...');
    expect(input.getAttribute('autoComplete')).toBe('off');
  });

  it('renders sport filter options', () => {
    render(<FilterBar {...createDefaultProps()} />);
    // Sport dropdown has "Sport" as default plus sports from translations
    expect(screen.getByText('Sport')).toBeInTheDocument();
  });

  it('renders date filter options', () => {
    render(<FilterBar {...createDefaultProps()} />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Week')).toBeInTheDocument();
  });

  it('renders gender filter options', () => {
    render(<FilterBar {...createDefaultProps()} />);
    expect(screen.getByText(/All/)).toBeInTheDocument();
    expect(screen.getByText(/Women/)).toBeInTheDocument();
    expect(screen.getByText(/Men/)).toBeInTheDocument();
  });

  it('calls setSearchQuery on input change', () => {
    const setSearchQuery = vi.fn();
    render(<FilterBar {...createDefaultProps({ setSearchQuery })} />);

    const input = screen.getByPlaceholderText('Search sessions...');
    fireEvent.change(input, { target: { value: 'yoga' } });

    expect(setSearchQuery).toHaveBeenCalledWith('yoga');
  });

  it('shows clear all button when filters are active', () => {
    render(<FilterBar {...createDefaultProps({ searchQuery: 'running' })} />);
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('clear all resets ALL filters', () => {
    const setSearchQuery = vi.fn();
    const setSelectedSport = vi.fn();
    const setDateFilter = vi.fn();
    const setGenderFilter = vi.fn();

    render(
      <FilterBar
        {...createDefaultProps({
          searchQuery: 'running',
          selectedSport: 'Soccer',
          dateFilter: 'today',
          genderFilter: 'women_only',
          setSearchQuery,
          setSelectedSport,
          setDateFilter,
          setGenderFilter,
        })}
      />
    );

    fireEvent.click(screen.getByText('Clear all'));

    expect(setSearchQuery).toHaveBeenCalledWith('');
    expect(setSelectedSport).toHaveBeenCalledWith('');
    expect(setDateFilter).toHaveBeenCalledWith('all');
    expect(setGenderFilter).toHaveBeenCalledWith('all');
  });

  it('shows filtered count', () => {
    render(<FilterBar {...createDefaultProps({ filteredCount: 12 })} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('shows distance slider when user location is available', () => {
    render(
      <FilterBar
        {...createDefaultProps({
          userLocation: { latitude: 6.24, longitude: -75.58 },
        })}
      />
    );
    expect(screen.getByText('Dist.')).toBeInTheDocument();
  });
});
