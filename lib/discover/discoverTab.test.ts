import { describe, it, expect } from 'vitest';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';
import { discoverTabQuery, filterGyms, parseDiscoverTab } from './discoverTab';

// Typed, never cast (CLAUDE.md, "A CAST IN A TEST FIXTURE").
function gym(over: Partial<GymDirectoryEntry> = {}): GymDirectoryEntry {
  return {
    id: 'g1',
    business_name: 'CrossFit BullBox',
    business_type: 'gym',
    logo_url: null,
    status: 'active',
    user_id: 'u1',
    address: 'Cl. 10 #36-20, El Poblado',
    specialties: ['CrossFit', 'HYROX'],
    coachCount: 3,
    accountAvatarUrl: null,
    sessionsPerWeek: 5,
    slug: 'bullbox',
    pass_active: true,
    ...over,
  };
}

describe('parseDiscoverTab', () => {
  it('opens on gyms for the shared link value, in either language and any case', () => {
    expect(parseDiscoverTab('gimnasios')).toBe('gyms');
    expect(parseDiscoverTab('Gimnasios')).toBe('gyms');
    expect(parseDiscoverTab('gyms')).toBe('gyms');
    expect(parseDiscoverTab(['gimnasios', 'x'])).toBe('gyms');
  });

  it('falls back to instructors for anything else', () => {
    expect(parseDiscoverTab(undefined)).toBe('instructors');
    expect(parseDiscoverTab(null)).toBe('instructors');
    expect(parseDiscoverTab('')).toBe('instructors');
    expect(parseDiscoverTab('nonsense')).toBe('instructors');
  });

  it('round-trips through the query it writes', () => {
    const q = new URLSearchParams(discoverTabQuery('gyms'));
    expect(parseDiscoverTab(q.get('ver'))).toBe('gyms');
    expect(discoverTabQuery('instructors')).toBe('');
  });
});

describe('filterGyms', () => {
  const bullbox = gym();
  const zona = gym({
    id: 'g2',
    business_name: 'Zona de Combate',
    address: 'Envigado',
    specialties: ['Jiu-Jítsu', 'Boxeo'],
    slug: 'zona',
  });

  it('matches name, neighborhood and discipline', () => {
    expect(filterGyms([bullbox, zona], 'bull')).toEqual([bullbox]);
    expect(filterGyms([bullbox, zona], 'poblado')).toEqual([bullbox]);
    expect(filterGyms([bullbox, zona], 'hyrox')).toEqual([bullbox]);
  });

  it('ignores accents on either side', () => {
    expect(filterGyms([bullbox, zona], 'jiu-jitsu')).toEqual([zona]);
    expect(filterGyms([bullbox, zona], 'Énvigado')).toEqual([zona]);
  });

  it('returns everything for an empty or blank query, and survives null fields', () => {
    expect(filterGyms([bullbox, zona], '  ')).toEqual([bullbox, zona]);
    const bare = gym({ address: null, specialties: null });
    expect(filterGyms([bare], 'poblado')).toEqual([]);
  });
});
