/**
 * T-AV27b: /admin/atletas/, the page's own layer (middleware's real 404 is in
 * athleteValueGate.test.ts and the proof). Mutation proof: delete the admin
 * check -> "a non-admin gets not-found and nothing is read" RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GYM_PARTNER_ID, gymSummary } from '@/lib/atletas/gymFixtures';

const h = vi.hoisted(() => ({
  gate: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  programs: vi.fn(),
  partners: vi.fn(),
  summary: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/lib/features/athleteValueServer', () => ({ requireAthleteValuePage: h.gate }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteAdmin', () => ({
  fetchIsAppAdmin: h.isAdmin,
  fetchAdminPrograms: h.programs,
  fetchPartnersWithoutProgram: h.partners,
}));
vi.mock('@/lib/dal/athleteGym', () => ({ fetchPartnerSummary: h.summary }));
vi.mock('./AdminAthletes', () => ({ default: () => null }));

import AdminAthletesPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  h.gate.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
  h.isAdmin.mockResolvedValue({ success: true, data: true });
  h.programs.mockResolvedValue({
    success: true,
    data: [{ partnerId: GYM_PARTNER_ID, partnerName: 'BullBox (Prueba)', isActive: true }],
  });
  h.partners.mockResolvedValue({ success: true, data: [{ id: 'p2', name: 'Otro Gym (Prueba)' }] });
  h.summary.mockResolvedValue({ success: true, data: gymSummary({ role: 'admin' }) });
});

describe('/admin/atletas/', () => {
  it('flag off first: not found before the session', async () => {
    h.gate.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    await expect(AdminAthletesPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.gate).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('a non-admin gets not-found and nothing is read', async () => {
    h.isAdmin.mockResolvedValue({ success: true, data: false });
    await expect(AdminAthletesPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.programs).not.toHaveBeenCalled();
  });

  it('an admin gets every program with its summary view and the partners without one', async () => {
    const el = (await AdminAthletesPage()) as {
      props: {
        programs: Array<{ partnerName: string; view: { canManage: boolean } | null }>;
        partnersWithoutProgram: unknown;
      };
    };
    expect(h.summary).toHaveBeenCalledWith(expect.anything(), GYM_PARTNER_ID);
    expect(el.props.programs[0].partnerName).toBe('BullBox (Prueba)');
    expect(el.props.programs[0].view?.canManage).toBe(true);
    expect(el.props.partnersWithoutProgram).toEqual([{ id: 'p2', name: 'Otro Gym (Prueba)' }]);
  });
});
