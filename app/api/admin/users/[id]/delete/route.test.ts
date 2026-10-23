import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));
vi.mock('@/lib/account/deleteAccount', () => ({ deleteAccount: vi.fn() }));

import { POST } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { deleteAccount } from '@/lib/account/deleteAccount';

/**
 * The route used to gate on isAdmin() (the ADMIN_EMAILS list) while /admin
 * gates on is_app_admin(). These tests pin the replacement gate and the two
 * refusals added with it. The negative assertion in each refusal is that the
 * deletion was NEVER run, not merely that the status code is right.
 *
 * T-DEL1: the deletion is lib/account/deleteAccount, the in-app path, not the
 * admin_delete_user RPC.
 */
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const TARGET = '00000000-0000-0000-0000-0000000000b0';

function fakeService(target: { data: unknown; error: unknown }) {
  const rpc = vi.fn();
  const service = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(target) }) }) }),
    rpc,
  };
  return { service, rpc };
}

function call(id: string) {
  return POST(new Request('https://x', { method: 'POST' }), { params: Promise.resolve({ id }) });
}

function asAdminWith(target: { data: unknown; error: unknown }) {
  const f = fakeService(target);
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
  return f;
}

let f: ReturnType<typeof fakeService>;

beforeEach(() => {
  vi.clearAllMocks();
  f = asAdminWith({ data: { id: TARGET, is_admin: false }, error: null });
  vi.mocked(deleteAccount).mockResolvedValue({
    ok: true,
    filesDeleted: 3,
    notified: { sent: 0, suppressed: 0, no_token: 0, failed: 0 },
  });
});

describe('POST /api/admin/users/[id]/delete', () => {
  it('gates on requireApiAdmin (is_app_admin), and never runs the deletion for a non-admin', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(403);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('T-DEL1: deletes a regular account through the in-app path, never admin_delete_user', async () => {
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledWith(f.service, TARGET);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('REFUSES deleting your own account', async () => {
    const res = await call(ADMIN);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cannot_delete_self' });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('REFUSES deleting another admin', async () => {
    asAdminWith({ data: { id: TARGET, is_admin: true }, error: null });
    const res = await call(TARGET);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'target_is_admin' });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the admin check on the target errors', async () => {
    asAdminWith({ data: null, error: { message: 'boom' } });
    const res = await call(TARGET);
    expect(res.status).toBe(500);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('T-DEL1: an account already marked deleted is run again, which finishes a delete that stopped partway', async () => {
    asAdminWith({ data: { id: TARGET, is_admin: false }, error: null });
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('names the step a failed deletion stopped at', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'scrub_data', error: 'guard' });
    const res = await call(TARGET);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed', step: 'scrub_data' });
  });

  it('says owns_gym when the account owns a gym, and user_not_found when it is gone', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'check', error: 'owns_gym' });
    let res = await call(TARGET);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'owns_gym' });
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'check', error: 'owns_partner' });
    res = await call(TARGET);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'owns_partner' });
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'check', error: 'user_not_found' });
    res = await call(TARGET);
    expect(res.status).toBe(404);
  });
});
