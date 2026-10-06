/**
 * T-AV27b: POST /api/admin/atletas, this route's own layer. The database
 * layer and the three layered arms are t-av27b-proof/mutations.LOCAL.sh.
 *
 * Mutation proofs (run by the T-AV27b unit arms):
 *   - delete the admin check -> "a non-admin is refused before any write"
 *   - drop the `!r.data` check on set_active -> "no row updated is a 404"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const h = vi.hoisted(() => ({ off: vi.fn(), getUser: vi.fn(), isAdmin: vi.fn(), create: vi.fn(), setActive: vi.fn() }));
vi.mock('@/lib/features/athleteValueServer', () => ({ athleteValueOr404: h.off }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteAdmin', () => ({
  fetchIsAppAdmin: h.isAdmin,
  createAthleteProgram: h.create,
  setProgramActive: h.setActive,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { POST } from './route';

const P = '00000000-0000-4000-8000-000000007001';
const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/atletas/', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  h.off.mockResolvedValue(null);
  h.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  h.isAdmin.mockResolvedValue({ success: true, data: true });
  h.create.mockResolvedValue({ success: true, data: true });
  h.setActive.mockResolvedValue({ success: true, data: true });
});

describe('POST /api/admin/atletas', () => {
  it('flag off: 404 first', async () => {
    h.off.mockResolvedValue(NextResponse.json({ error: 'not_found' }, { status: 404 }));
    expect((await post({ action: 'create', partnerId: P })).status).toBe(404);
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('a non-admin is refused before any write', async () => {
    h.isAdmin.mockResolvedValue({ success: true, data: false });
    expect((await post({ action: 'set_active', partnerId: P, active: true })).status).toBe(404);
    expect((await post({ action: 'create', partnerId: P })).status).toBe(404);
    expect(h.setActive).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('an admin creates a program and switches it on or off', async () => {
    expect((await post({ action: 'create', partnerId: P })).status).toBe(200);
    expect(h.create).toHaveBeenCalledWith(expect.anything(), P);
    expect((await post({ action: 'set_active', partnerId: P, active: true })).status).toBe(200);
    expect(h.setActive).toHaveBeenCalledWith(expect.anything(), P, true);
  });

  it('no row updated is a 404; an existing program is a 409; a refused write is a 404', async () => {
    h.setActive.mockResolvedValue({ success: true, data: false });
    expect((await post({ action: 'set_active', partnerId: P, active: true })).status).toBe(404);
    h.create.mockResolvedValue({ success: false, error: 'exists' });
    expect((await post({ action: 'create', partnerId: P })).status).toBe(409);
    h.setActive.mockResolvedValue({ success: false, error: 'forbidden' });
    expect((await post({ action: 'set_active', partnerId: P, active: false })).status).toBe(404);
  });

  it('a bad id, action or flag value is a 400 with no write', async () => {
    for (const body of [
      { action: 'create', partnerId: 'x' },
      { action: 'drop', partnerId: P },
      { action: 'set_active', partnerId: P, active: 'yes' },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(h.setActive).not.toHaveBeenCalled();
  });

  it("uses the admin's own session, never the service role, by any spelling", () => {
    const src = sourceWithoutComments(path.join(__dirname, 'route.ts'));
    expect(src).not.toMatch(/SERVICE_ROLE|getServiceRoleClient|createServiceClient|@supabase\/supabase-js/);
    const dal = sourceWithoutComments(path.join(__dirname, '../../../../lib/dal/athleteAdmin.ts'));
    expect(dal).not.toMatch(/SERVICE_ROLE|getServiceRoleClient|createServiceClient/);
  });
});
