import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

/**
 * T-SSR1: signed out, /session/<id>/ is rendered on the server, so the first
 * HTML already holds the poster, the facts and the booking button. Signed in
 * it is the app's client page, unchanged. Nothing here reaches a database.
 */
const STREET = 'Cra 43A #1-50';
const row = {
  id: 'f8230509-9aa3-4a79-98e4-afa7b6e695ef',
  title: null,
  sport: 'Boxing',
  date: '2030-10-21',
  start_time: '18:30:00',
  end_time: '19:30:00',
  duration: 60,
  status: 'active',
  location: `${STREET}, El Poblado, Medellín`,
  location_lat: 6.2086,
  location_lng: -75.5659,
  photos: [],
  creator_id: 'c1',
  creator_name: 'Salomon Tabares',
  creator_avatar_url: null,
  partner_id: null,
  partner_status: null,
  description: 'Guantes y vendas.',
  price_cents: 0,
  currency: 'COP',
  is_paid: false,
  is_test: false,
  max_participants: 10,
  current_participants: 3,
};
const rows = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const request = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string }[],
  acceptLanguage: null as string | null,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => request.cookies,
    get: (name: string) => request.cookies.find((c) => c.name === name),
  }),
  headers: async () => new Headers(request.acceptLanguage ? { 'accept-language': request.acceptLanguage } : {}),
}));
vi.mock('@/lib/og/sessionCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/og/sessionCard')>()),
  loadSessionForCard: async (id: string) => {
    const r = rows.current[id];
    return r ? { row: r, partnerName: null, host: { id: 'c1' } } : null;
  },
}));
vi.mock('./SessionDetailClient', () => ({
  default: ({ hostHero }: { hostHero?: { url: string } | null }) => (
    <div data-testid="app-session-page" data-hero={hostHero?.url ?? 'none'} />
  ),
}));
vi.mock('@/lib/site/coachPage', () => ({
  coachHeroPhoto: async (host: { id: string }) => ({ url: `https://x/card-${host.id}.jpg`, x: 50, y: 20 }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const insertGuestParticipant = vi.fn();
vi.mock('@/hooks/sessionActionHelpers', () => ({
  insertGuestParticipant: (...a: unknown[]) => insertGuestParticipant(...a),
  removeGuestParticipant: vi.fn(),
  storeGuestLocally: vi.fn(),
  notifyHostOfGuestJoin: vi.fn(),
}));

import SessionPage from './page';

const html = async (id = row.id) => renderToString(await SessionPage({ params: Promise.resolve({ id }) }));

beforeEach(() => {
  rows.current = { [row.id]: row };
  request.cookies = [];
  request.acceptLanguage = null;
  insertGuestParticipant.mockReset();
});

describe('/session/<id>/ (T-SSR1)', () => {
  it('signed out: the first HTML has the title, the facts and "Pedir mi cupo"', async () => {
    const out = await html();
    expect(out).toMatch(/<h1[^>]*>Boxeo con Salomon<\/h1>/);
    for (const label of ['Cuándo', 'Dónde', 'Cuánto', 'Quién']) expect(out).toContain(label);
    expect(out).toContain('Pedir mi cupo');
    expect(out).toContain('El Poblado');
    expect(out).not.toContain('app-session-page');
    // Rendering does not join anyone.
    expect(insertGuestParticipant).not.toHaveBeenCalled();
  });

  it('never writes the street address into the HTML (props included)', async () => {
    const out = await html();
    expect(out).not.toContain(STREET);
    expect(out).not.toContain('Cra 43A');
  });

  it('is in the visitor’s language: cookie, then Accept-Language', async () => {
    request.acceptLanguage = 'en-US,en;q=0.9';
    expect(await html()).toContain('Boxing with Salomon');
    request.cookies = [{ name: 'tribe_lang', value: 'es' }];
    expect(await html()).toContain('Boxeo con Salomon');
  });

  it('a cancelled session renders on the server too (its page says so)', async () => {
    rows.current = { [row.id]: { ...row, status: 'cancelled' } };
    const out = await html();
    expect(out).toMatch(/<h1[^>]*>Boxeo con Salomon<\/h1>/);
    expect(out).toContain('Esta sesión fue cancelada');
    expect(out).not.toContain('Pedir mi cupo');
  });

  it('signed in: the app’s session page, with the host’s card photo as its hero (T-UI-SD1)', async () => {
    request.cookies = [{ name: 'sb-ref-auth-token', value: 'x' }];
    const out = await html();
    expect(out).toContain('app-session-page');
    expect(out).toContain('data-hero="https://x/card-c1.jpg"');
  });

  it('a test session or an id outside the public view keeps the client page', async () => {
    rows.current = { [row.id]: { ...row, is_test: true } };
    expect(await html()).toContain('app-session-page');
    expect(await html('00000000-0000-4000-8000-000000000000')).toContain('app-session-page');
  });
});
