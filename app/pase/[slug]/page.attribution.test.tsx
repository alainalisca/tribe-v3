/**
 * T-AV23: the "Te invita" chip and the consent the pass page shows.
 *
 * Mounted, not a source scan: whether the chip appears depends on the flag,
 * the program row and the athlete lookup together, and the flag-off case has
 * to be OBSERVED doing nothing (no read, no chip, V1) rather than inferred.
 * PaseForm is stubbed to print the consent it was handed; its own behaviour
 * is not under test here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const CONFIG = {
  partnerId: 'p-bullbox',
  slug: 'bullbox-prueba',
  partnerName: 'BullBox (Prueba)',
  businessType: 'gym',
  address: null,
  logoUrl: null,
  storefrontUserId: null,
  headline: null,
  sub: null,
  options: {},
  leadWhatsapp: null,
  leadEmail: 'bullbox@av.local',
  leadCc: [],
};

vi.mock('next/image', () => ({ default: () => null }));
// React 18.3 in the test environment has no cache(); Next uses its own React
// at runtime. Per-request memoization is not what this file tests.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn(() => ({})) }));
vi.mock('@/lib/dal/passLeads', () => ({
  fetchPassConfig: vi.fn(async () => CONFIG),
  isOrganizationPartner: () => true,
}));
vi.mock('@/lib/dal/athleteReferral', () => ({
  fetchAthleteProgramStatus: vi.fn(),
  findActiveAthleteByRefCode: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('./PaseForm', () => ({
  default: ({ consentText }: { consentText: string }) => <p data-testid="consent">{consentText}</p>,
}));
const serverClient = vi.hoisted(() => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } } }) },
    rpc: async () => ({ data: true, error: null }),
  })),
}));
vi.mock('@/lib/supabase/server', () => serverClient);

import PasePage from './page';
import { fetchAthleteProgramStatus, findActiveAthleteByRefCode } from '@/lib/dal/athleteReferral';

const V1 =
  'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox (Prueba) para que me contacte sobre mi clase gratis.';
const page = (search: Record<string, string>) =>
  PasePage({ params: Promise.resolve({ slug: 'bullbox-prueba' }), searchParams: Promise.resolve(search) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAthleteProgramStatus).mockResolvedValue({ isActive: true });
  vi.mocked(findActiveAthleteByRefCode).mockResolvedValue({ programAthleteId: 'pa-ana', firstName: 'Ana' });
});
afterEach(() => vi.unstubAllEnvs());

describe('the pass page with an athlete link', () => {
  it('flag off, a signed-in admin, ?src=atleta&code=ANA-7KQ: no chip, V1 consent, no read, no session', async () => {
    render(await page({ src: 'atleta', code: 'ANA-7KQ' }));
    expect(screen.queryByText(/Te invita/)).toBeNull();
    expect(screen.getByTestId('consent').textContent).toBe(V1);
    expect(fetchAthleteProgramStatus).not.toHaveBeenCalled();
    expect(serverClient.createClient).not.toHaveBeenCalled();
  });

  it('flag on, a code that resolves here: "Te invita Ana" and the attributed consent line', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    render(await page({ src: 'atleta', code: 'ANA-7KQ' }));
    expect(screen.getByText('Te invita Ana')).toBeTruthy();
    expect(screen.getByTestId('consent').textContent).toBe(
      V1 +
        ' Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó. BullBox (Prueba) y Tribe registrarán si asistí.'
    );
  });

  it('flag on, a code that does not resolve here: no chip, V1', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    vi.mocked(findActiveAthleteByRefCode).mockResolvedValue(null);
    render(await page({ src: 'atleta', code: 'ANA-7KQ' }));
    expect(screen.queryByText(/Te invita/)).toBeNull();
    expect(screen.getByTestId('consent').textContent).toBe(V1);
  });

  it('flag on, no link at all: no chip and no athlete lookup', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    render(await page({}));
    expect(screen.queryByText(/Te invita/)).toBeNull();
    expect(findActiveAthleteByRefCode).not.toHaveBeenCalled();
  });
});
