/**
 * T-AV26: the dashboard and settings pages' own layer (the second one; the
 * real 404 is middleware's, athleteValueGate.test.ts and the proof script).
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - dashboard: pass `summary.data` instead of toGymView(...) -> "hands the client the view model only"
 *   - settings: delete the role check -> "a coach gets not-found and no summary is read"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GYM_PARTNER_ID, gymSummary } from '@/lib/atletas/gymFixtures';
import { toGymView } from '@/lib/atletas/gymView';
import { settingsFromProgram } from '@/lib/atletas/gymSettings';

const h = vi.hoisted(() => ({
  requireAthleteValuePage: vi.fn(),
  getUser: vi.fn(),
  fetchPartnerSummary: vi.fn(),
  fetchMyPartnerRole: vi.fn(),
  dashboardProps: [] as unknown[],
  settingsProps: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/lib/features/athleteValueServer', () => ({ requireAthleteValuePage: h.requireAthleteValuePage }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteGym', () => ({
  fetchPartnerSummary: h.fetchPartnerSummary,
  fetchMyPartnerRole: h.fetchMyPartnerRole,
}));
vi.mock('./GymDashboard', () => ({
  default: (props: unknown) => {
    h.dashboardProps.push(props);
    return null;
  },
}));
vi.mock('./ajustes/GymSettingsForm', () => ({
  default: (props: unknown) => {
    h.settingsProps.push(props);
    return null;
  },
}));

import GymDashboardPage from './page';
import GymSettingsPage from './ajustes/page';

const params = (partnerId = GYM_PARTNER_ID) => ({ params: Promise.resolve({ partnerId }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.dashboardProps.length = 0;
  h.settingsProps.length = 0;
  h.requireAthleteValuePage.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
  h.fetchPartnerSummary.mockResolvedValue({ success: true, data: gymSummary() });
  h.fetchMyPartnerRole.mockResolvedValue({ success: true, data: 'owner' });
});

describe('/atletas/gym/[partnerId]/', () => {
  it('flag off: not found before the session is read', async () => {
    h.requireAthleteValuePage.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    await expect(GymDashboardPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.requireAthleteValuePage).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('signed out: /auth with the page as returnTo, and no summary read', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(GymDashboardPage(params())).rejects.toThrow(
      `NEXT_REDIRECT /auth?returnTo=${encodeURIComponent(`/atletas/gym/${GYM_PARTNER_ID}/`)}`
    );
    expect(h.fetchPartnerSummary).not.toHaveBeenCalled();
  });

  it('not staff of a partner with a program (summary null), or a bad id: not found', async () => {
    h.fetchPartnerSummary.mockResolvedValue({ success: true, data: null });
    await expect(GymDashboardPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(GymDashboardPage(params('bullbox'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a failed read throws rather than rendering an empty dashboard', async () => {
    h.fetchPartnerSummary.mockResolvedValue({ success: false, error: 'boom' });
    await expect(GymDashboardPage(params())).rejects.toThrow('gym summary unavailable');
  });

  it('hands the client the view model only', async () => {
    await GymDashboardPage(params());
    const el = (await GymDashboardPage(params())) as { props: { view: unknown } };
    expect(h.fetchPartnerSummary).toHaveBeenCalledWith(expect.anything(), GYM_PARTNER_ID);
    const view = el.props.view as ReturnType<typeof toGymView>;
    const expected = toGymView(GYM_PARTNER_ID, gymSummary());
    expect(Object.keys(view).sort()).toEqual(Object.keys(expected).sort());
    expect(view.funnel).toEqual(expected.funnel);
  });
});

describe('/atletas/gym/[partnerId]/ajustes/', () => {
  it('a coach gets not-found and no summary is read', async () => {
    h.fetchMyPartnerRole.mockResolvedValue({ success: true, data: 'coach' });
    await expect(GymSettingsPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.fetchPartnerSummary).not.toHaveBeenCalled();
    h.fetchMyPartnerRole.mockResolvedValue({ success: true, data: null });
    await expect(GymSettingsPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('owner and admin get the form, starting from every editable column', async () => {
    const el = (await GymSettingsPage(params())) as { props: { partnerId: string; initial: unknown } };
    expect(el.props.partnerId).toBe(GYM_PARTNER_ID);
    expect(el.props.initial).toEqual(settingsFromProgram(gymSummary().program));
    h.fetchMyPartnerRole.mockResolvedValue({ success: true, data: 'admin' });
    await expect(GymSettingsPage(params())).resolves.toBeTruthy();
  });

  it('flag off first, then the session', async () => {
    h.requireAthleteValuePage.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    await expect(GymSettingsPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.getUser).not.toHaveBeenCalled();
    h.requireAthleteValuePage.mockResolvedValue(undefined);
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(GymSettingsPage(params())).rejects.toThrow(
      `NEXT_REDIRECT /auth?returnTo=${encodeURIComponent(`/atletas/gym/${GYM_PARTNER_ID}/ajustes/`)}`
    );
    expect(h.fetchMyPartnerRole).not.toHaveBeenCalled();
  });
});
