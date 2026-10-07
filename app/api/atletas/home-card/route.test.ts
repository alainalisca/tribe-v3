/**
 * T-AV24: the Home card endpoint answers a boolean and nothing else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const h = vi.hoisted(() => ({ off: vi.fn(), getUser: vi.fn(), hasActive: vi.fn() }));
vi.mock('@/lib/features/athleteValueServer', () => ({ athleteValueOr404: h.off }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteHome', () => ({ hasActiveAthleteRow: h.hasActive }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  h.off.mockResolvedValue(null);
  h.getUser.mockResolvedValue({ data: { user: { id: 'ana-user' } } });
  h.hasActive.mockResolvedValue(true);
});

describe('GET /api/atletas/home-card', () => {
  it("flag off: the program's ordinary 404, and no read", async () => {
    h.off.mockResolvedValue(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
    expect((await GET()).status).toBe(404);
    expect(h.hasActive).not.toHaveBeenCalled();
    expect(h.off).toHaveBeenCalledWith('athletes');
  });

  it('an active athlete: exactly { active: true }, private and uncached', async () => {
    const res = await GET();
    expect(await res.json()).toStrictEqual({ active: true });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(h.hasActive).toHaveBeenCalledWith(expect.anything(), 'ana-user');
  });

  it('not an active athlete, signed out, or an error: exactly { active: false }', async () => {
    h.hasActive.mockResolvedValue(false);
    expect(await (await GET()).json()).toStrictEqual({ active: false });
    h.getUser.mockResolvedValue({ data: { user: null } });
    expect(await (await GET()).json()).toStrictEqual({ active: false });
    h.getUser.mockRejectedValue(new Error('auth down'));
    expect(await (await GET()).json()).toStrictEqual({ active: false });
  });
});
