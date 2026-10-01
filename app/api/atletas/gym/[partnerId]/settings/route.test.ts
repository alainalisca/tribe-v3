/**
 * T-AV26: POST /api/atletas/gym/[partnerId]/settings.
 *
 * These pin the route's own layer: the order of checks, that a coach is
 * RECOGNISED as refused (the update is never attempted, not merely that the
 * status happens to be 404), and that only the allowlisted body reaches the
 * DAL. The database layer (RLS) and the layered mutation proof against the
 * real stack are in supabase/recon/t-av26-proof.LOCAL.sh and
 * t-av26-mutations.LOCAL.sh (arms S1 to S3).
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - delete the `callerRole` check -> "a coach is refused before any write"
 *   - send `body` instead of `parsed.value` -> "only the allowlisted settings reach the update"
 *   - drop `if (!saved.data) return notFound()` -> "zero rows updated (RLS filtered it out) is the same 404"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const h = vi.hoisted(() => ({
  off: vi.fn(),
  getUser: vi.fn(),
  role: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/lib/features/athleteValueServer', () => ({ athleteValueOr404: h.off }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/athleteGym', () => ({ fetchMyPartnerRole: h.role }));
vi.mock('@/lib/dal/athleteGymWrites', () => ({ updateProgramSettings: h.update }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { POST } from './route';

const P = '00000000-0000-4000-8000-000000007000';
const BODY = {
  welcome_offer_en: 'First month 20% off.',
  welcome_offer_es: 'Primer mes con 20% de descuento.',
  showup_reward_en: null,
  showup_reward_es: 'Clases ilimitadas',
  class_access_en: null,
  class_access_es: null,
  conversion_bonus_note_en: null,
  conversion_bonus_note_es: null,
  conversion_bonus_cop: 50000,
  retention_days: 30,
  promote_at_showups: 10,
  max_athletes: 5,
  pilot_starts_on: null,
  pilot_ends_on: null,
};

const post = (body: unknown, id = P) =>
  POST(
    new NextRequest(`http://localhost/api/atletas/gym/${id}/settings/`, {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ partnerId: id }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.off.mockResolvedValue(null);
  h.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
  h.role.mockResolvedValue({ success: true, data: 'owner' });
  h.update.mockResolvedValue({ success: true, data: true });
});

describe('POST /api/atletas/gym/[partnerId]/settings', () => {
  it('flag off: the 404 comes before the session is read', async () => {
    h.off.mockResolvedValue(NextResponse.json({ success: false, error: 'not_found' }, { status: 404 }));
    expect((await post(BODY)).status).toBe(404);
    expect(h.off).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('a malformed partner id is a 404 without a session read', async () => {
    expect((await post(BODY, 'bullbox')).status).toBe(404);
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('signed out is a 401 and nothing is read', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await post(BODY)).status).toBe(401);
    expect(h.role).not.toHaveBeenCalled();
  });

  it('a coach is refused before any write, with the same body as another gym', async () => {
    h.role.mockResolvedValue({ success: true, data: 'coach' });
    const coach = await post(BODY);
    h.role.mockResolvedValue({ success: true, data: null });
    const stranger = await post(BODY);
    expect(coach.status).toBe(404);
    expect(stranger.status).toBe(404);
    expect(await coach.json()).toStrictEqual(await stranger.json());
    expect(h.update).not.toHaveBeenCalled();
    expect(h.role).toHaveBeenCalledWith(expect.anything(), P);
  });

  it('owner and admin save; only the allowlisted settings reach the update', async () => {
    const res = await post({ ...BODY, is_active: true, partner_id: 'someone-else' });
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ success: true });
    expect(h.update).toHaveBeenCalledWith(expect.anything(), P, BODY);
    h.role.mockResolvedValue({ success: true, data: 'admin' });
    expect((await post(BODY)).status).toBe(200);
  });

  it('zero rows updated (RLS filtered it out) is the same 404', async () => {
    h.update.mockResolvedValue({ success: true, data: false });
    const res = await post(BODY);
    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual({ error: 'not_found' });
  });

  it('an invalid body is a 400 naming the field, with no write', async () => {
    const res = await post({ ...BODY, retention_days: 3 });
    expect(res.status).toBe(400);
    expect(await res.json()).toStrictEqual({ error: 'invalid', field: 'retention_days' });
    expect((await post('{not json')).status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('a failed role read or write is a 500, not a 404 or a success', async () => {
    h.role.mockResolvedValue({ success: false, error: 'boom' });
    expect((await post(BODY)).status).toBe(500);
    h.role.mockResolvedValue({ success: true, data: 'owner' });
    h.update.mockResolvedValue({ success: false, error: 'boom' });
    expect((await post(BODY)).status).toBe(500);
  });

  it("uses the caller's session, never the service role, by any spelling", () => {
    const src = sourceWithoutComments(path.join(__dirname, 'route.ts'));
    expect(src).not.toMatch(/SERVICE_ROLE/);
    expect(src).not.toMatch(/getServiceRoleClient|createServiceClient|createAdminClient/);
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).toMatch(/from '@\/lib\/supabase\/server'/);
  });
});
