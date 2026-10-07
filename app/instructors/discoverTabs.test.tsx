import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';
import type { InstructorProfile } from '@/lib/dal/instructors';

/**
 * The Instructores / Gimnasios y estudios switch on Discover.
 *
 * The defect: gyms were only reachable by scrolling past every instructor to a
 * section at the bottom, and a failed gym load rendered as nothing at all
 * (`gymsFailed` reached the client and was never read). These tests assert
 * what the viewer SEES per tab, including that each list is absent from the
 * other tab, which is the property that makes this a switch and not two
 * sections stacked.
 */

const { mockReplace, mockRefresh, mockTrack } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
  mockTrack: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: mockTrack }));
vi.mock('@/lib/location', () => ({ requestUserLocation: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('next/link', () => ({ default: (p: { children?: unknown }) => <a>{p.children as never}</a> }));
vi.mock('@/components/BottomNav', () => ({ default: () => <nav /> }));
vi.mock('@/components/InstructorCard', () => ({
  default: (p: { instructor: { name: string } }) => <div data-testid="instructor-card">{p.instructor.name}</div>,
}));
vi.mock('@/components/FeaturedInstructorCarousel', () => ({ default: () => <div /> }));
// The REAL GymsAndStudiosSection renders, so the gym name assertions below are
// about the actual cards, not a stub that could never be absent.

import InstructorsPageClient from './InstructorsPageClient';

function instructor(): InstructorProfile {
  return {
    id: 'i1',
    name: 'Ronald Gallego',
    avatar_url: null,
    tagline: null,
    location: 'Medellín',
    sports: ['Jiu-Jitsu'],
    specialties: [],
    verified: true,
    average_rating: 5,
    total_reviews: 2,
    total_sessions: 3,
    is_instructor: true,
    created_at: '2026-01-01T00:00:00Z',
    location_lat: null,
    location_lng: null,
    years_experience: 4,
  };
}

function gym(over: Partial<GymDirectoryEntry> = {}): GymDirectoryEntry {
  return {
    id: 'g1',
    business_name: 'CrossFit BullBox',
    business_type: 'gym',
    logo_url: null,
    status: 'active',
    user_id: 'u1',
    address: 'Cl. 10 #36-20, El Poblado',
    specialties: ['CrossFit'],
    coachCount: 3,
    accountAvatarUrl: null,
    sessionsPerWeek: 5,
    slug: 'bullbox',
    pass_active: false,
    ...over,
  };
}

const zona = gym({ id: 'g2', business_name: 'Zona de Combate', address: 'Envigado', slug: 'zona', user_id: 'u2' });

function mount(props: Partial<Parameters<typeof InstructorsPageClient>[0]> = {}) {
  render(
    <InstructorsPageClient
      initialInstructors={[instructor()]}
      instructorsFailed={false}
      gyms={[gym(), zona]}
      gymsFailed={false}
      initialTab="instructors"
      {...props}
    />
  );
}

describe('Discover tabs', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockTrack.mockReset();
  });

  it('opens on instructors by default, with no gym cards on that tab', () => {
    mount();
    expect(screen.getByTestId('discover-tab-instructors').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('instructor-card')).toBeTruthy();
    expect(screen.queryByText('CrossFit BullBox')).toBeNull();
  });

  it('shows each list count on its tab', () => {
    mount();
    expect(screen.getByTestId('discover-tab-instructors').textContent).toContain('1');
    expect(screen.getByTestId('discover-tab-gyms').textContent).toContain('2');
    // Phones get the short label (the full one truncated on an iPhone); the
    // full label stays the accessible name.
    expect(screen.getByTestId('discover-tab-gyms').getAttribute('aria-label')).toBe('Gimnasios y estudios (2)');
    const short = screen.getByTestId('discover-tab-gyms').querySelector('.sm\\:hidden');
    expect(short?.textContent).toBe('Gimnasios');
  });

  it('switches to gyms: gym cards shown, instructors hidden, URL and analytics updated', () => {
    mount();
    fireEvent.click(screen.getByTestId('discover-tab-gyms'));
    expect(screen.getByText('CrossFit BullBox')).toBeTruthy();
    expect(screen.getByText('Zona de Combate')).toBeTruthy();
    expect(screen.queryByTestId('instructor-card')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Descubre Gimnasios');
    expect(mockReplace).toHaveBeenCalledWith('/instructors/?ver=gimnasios', { scroll: false });
    expect(mockTrack).toHaveBeenCalledWith('discover_tab_changed', { tab: 'gyms' });
  });

  it('opens straight on gyms from the shared link', () => {
    mount({ initialTab: 'gyms' });
    expect(screen.getByTestId('discover-tab-gyms').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('CrossFit BullBox')).toBeTruthy();
    expect(screen.queryByTestId('instructor-card')).toBeNull();
  });

  it('searches gyms by neighborhood, and offers Clear Search only when the search is the cause', () => {
    mount({ initialTab: 'gyms' });
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, barrio/), { target: { value: 'envigado' } });
    expect(screen.getByText('Zona de Combate')).toBeTruthy();
    expect(screen.queryByText('CrossFit BullBox')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre, barrio/), { target: { value: 'zzz' } });
    expect(screen.getByText('No se encontraron gimnasios')).toBeTruthy();
    fireEvent.click(screen.getByText('Limpiar búsqueda'));
    expect(screen.getByText('CrossFit BullBox')).toBeTruthy();
  });

  it('a FAILED gym load says so and offers retry, not an empty directory', () => {
    mount({ initialTab: 'gyms', gyms: [], gymsFailed: true });
    expect(screen.getByText('No pudimos cargar los gimnasios')).toBeTruthy();
    expect(screen.queryByText('Aún no hay gimnasios')).toBeNull();
    fireEvent.click(screen.getByText('Intentar de nuevo'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('an EMPTY gym directory says so, with no retry and no search box', () => {
    mount({ initialTab: 'gyms', gyms: [] });
    expect(screen.getByText('Aún no hay gimnasios')).toBeTruthy();
    expect(screen.queryByText('Intentar de nuevo')).toBeNull();
    expect(screen.queryByPlaceholderText(/Buscar por nombre, barrio/)).toBeNull();
  });
});
