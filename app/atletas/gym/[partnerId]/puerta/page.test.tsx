/**
 * T-AV25: the door list page's gating. Order, signed-out redirect, and that
 * "not yours" and "no such partner" are the same not-found.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  requireAthleteValuePage: vi.fn(),
  getUser: vi.fn(),
  fetchDoorList: vi.fn(),
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
vi.mock('@/lib/features/athleteValueServer', () => ({ requireAthleteValuePage: h.requireAthleteValuePage }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/passDoor', () => ({ fetchDoorList: h.fetchDoorList }));
vi.mock('./DoorList', () => ({
  default: (p: unknown) => {
    h.props.push(p);
    return null;
  },
}));

import DoorListPage from './page';

const P = 'ccb8502a-893a-474e-aa3c-bbfc339f48a2';
const params = (partnerId = P) => ({ params: Promise.resolve({ partnerId }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.props.length = 0;
  h.requireAthleteValuePage.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ data: { user: { id: 'coach' } } });
  h.fetchDoorList.mockResolvedValue({ success: true, data: [] });
});

describe('/atletas/gym/[partnerId]/puerta/', () => {
  it('flag off: not found, and the session is never read', async () => {
    h.requireAthleteValuePage.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    await expect(DoorListPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.requireAthleteValuePage).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('signed out: redirect to /auth with this page as returnTo, no read', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(DoorListPage(params())).rejects.toThrow(
      `NEXT_REDIRECT /auth?returnTo=${encodeURIComponent(`/atletas/gym/${P}/puerta/`)}`
    );
    expect(h.fetchDoorList).not.toHaveBeenCalled();
  });

  it('a partner id that is not a uuid: not found, without a read', async () => {
    await expect(DoorListPage(params('bullbox'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.fetchDoorList).not.toHaveBeenCalled();
  });

  it('not your gym and no such partner are the same not-found', async () => {
    h.fetchDoorList.mockResolvedValue({ success: true, data: null });
    await expect(DoorListPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.fetchDoorList).toHaveBeenCalledWith(expect.anything(), P);
  });

  it('your gym: the list gets the entries and nothing else', async () => {
    const entries = [
      {
        guestFirstName: 'Laura',
        passCode: 'BU-4F7K',
        claimedAt: 'x',
        attendedAt: null,
        outcome: null,
        athleteFirstName: 'Ana',
      },
    ];
    h.fetchDoorList.mockResolvedValue({ success: true, data: entries });
    const el = await DoorListPage(params());
    (el.type as (p: unknown) => unknown)(el.props);
    expect(h.props.at(-1)).toStrictEqual({ entries });
  });

  it('a read failure is an error, not an empty list', async () => {
    h.fetchDoorList.mockResolvedValue({ success: false, error: 'down' });
    await expect(DoorListPage(params())).rejects.toThrow('door list unavailable');
  });
});
