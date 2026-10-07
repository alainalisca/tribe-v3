/**
 * T-AV24: /atletas/ gating and what it hands to the client.
 *
 * Mutation proofs (supabase/recon/t-av24-mutations.LOCAL.sh and the unit
 * driver in the T-AV24 report): read the session before the flag, and the
 * flag-off test goes red; pass the raw RPC entry instead of the view model,
 * and the "exact props" test goes red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summaryProgram } from '@/lib/atletas/fixtures';

const h = vi.hoisted(() => ({
  requireAthleteValuePage: vi.fn(),
  getUser: vi.fn(),
  fetchMyAthleteSummary: vi.fn(),
  fetchPartnerSlug: vi.fn(),
  fetchOwnProfileBasics: vi.fn(),
  renderQrSvg: vi.fn(() => '<svg>qr</svg>'),
  headers: new Map<string, string>([['host', 'localhost:3001']]),
  props: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => ({ get: (k: string) => h.headers.get(k) ?? null }) }));
vi.mock('@/lib/features/athleteValueServer', () => ({ requireAthleteValuePage: h.requireAthleteValuePage }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteHome', () => ({
  fetchMyAthleteSummary: h.fetchMyAthleteSummary,
  fetchPartnerSlug: h.fetchPartnerSlug,
  fetchOwnProfileBasics: h.fetchOwnProfileBasics,
}));
vi.mock('@/lib/qr/renderQrSvg', () => ({ renderQrSvg: h.renderQrSvg }));
vi.mock('./AthleteHome', () => ({
  default: (props: unknown) => {
    h.props.push(props);
    return null;
  },
}));

import AthletesPage from './page';

async function renderPage() {
  const el = await AthletesPage();
  // Invoke the element's component so the mock records its props.
  (el.type as (p: unknown) => unknown)(el.props);
  return h.props.at(-1) as { view: Record<string, unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.props.length = 0;
  h.requireAthleteValuePage.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ data: { user: { id: 'ana-user' } } });
  h.fetchMyAthleteSummary.mockResolvedValue({ success: true, data: [summaryProgram()] });
  h.fetchPartnerSlug.mockResolvedValue('bullbox-prueba');
  h.fetchOwnProfileBasics.mockResolvedValue({ name: 'Ana Prueba', avatarUrl: null });
});

describe('/atletas/', () => {
  it('flag off is a 404, and the session is never read', async () => {
    h.requireAthleteValuePage.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    await expect(AthletesPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.requireAthleteValuePage).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.fetchMyAthleteSummary).not.toHaveBeenCalled();
  });

  it('signed out redirects to /auth with /atletas/ as returnTo, and reads nothing', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(AthletesPage()).rejects.toThrow(`NEXT_REDIRECT /auth?returnTo=${encodeURIComponent('/atletas/')}`);
    expect(h.fetchMyAthleteSummary).not.toHaveBeenCalled();
  });

  it('not in a program: the view is exactly { state: "none" }', async () => {
    h.fetchMyAthleteSummary.mockResolvedValue({ success: true, data: [] });
    expect((await renderPage()).view).toStrictEqual({ state: 'none' });
  });

  it('an athlete: the client gets the view model, never the raw RPC entry', async () => {
    const { view } = await renderPage();
    expect(Object.keys(view).sort()).toEqual(
      [
        'avatarUrl',
        'counts',
        'firstName',
        'guests',
        'level',
        'link',
        'linkActive',
        'partnerName',
        'progress',
        'qrSvg',
        'readyToPromote',
        'rewards',
        'state',
      ].sort()
    );
    const json = JSON.stringify(view);
    expect(json).not.toContain('program_athlete_id');
    expect(json).not.toContain('00000000-0000-4000-8000-000000002001');
    expect(json).not.toContain('ccb8502a');
  });

  it('the link is built on the request origin, and the QR encodes it and is labelled with it', async () => {
    const { view } = await renderPage();
    expect(view.link).toBe('http://localhost:3001/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ');
    expect(h.renderQrSvg).toHaveBeenCalledWith(view.link, view.link);
    expect(view.qrSvg).toBe('<svg>qr</svg>');
  });

  it('paused: no slug read, no link, no QR rendered', async () => {
    h.fetchMyAthleteSummary.mockResolvedValue({ success: true, data: [summaryProgram({ status: 'paused' })] });
    const { view } = await renderPage();
    expect([view.linkActive, view.link, view.qrSvg]).toEqual([false, null, null]);
    expect(h.fetchPartnerSlug).not.toHaveBeenCalled();
    expect(h.renderQrSvg).not.toHaveBeenCalled();
  });

  it('a summary failure is an error, not an empty page', async () => {
    h.fetchMyAthleteSummary.mockResolvedValue({ success: false, error: 'down' });
    await expect(AthletesPage()).rejects.toThrow('athlete summary unavailable');
  });
});
