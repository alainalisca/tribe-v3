import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));

import { POST } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';

/**
 * The route used to gate on isAdmin() (the ADMIN_EMAILS list) while /admin
 * gates on is_app_admin(). These tests pin the replacement gate and the two
 * refusals added with it. The negative assertion in each refusal is that the
 * RPC was NEVER called, not merely that the status code is right.
 */
const ADMIN = '00000000-0000-0000-0000-00000000000a';
const TARGET = '00000000-0000-0000-0000-0000000000b0';

function fakeService(target: { data: unknown; error: unknown }, rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const service = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(target) }) }) }),
    rpc,
  };
  return { service, rpc };
}

function call(id: string) {
  return POST(new Request('https://x', { method: 'POST' }), { params: Promise.resolve({ id }) });
}

let f: ReturnType<typeof fakeService>;

beforeEach(() => {
  vi.clearAllMocks();
  f = fakeService(
    { data: { id: TARGET, is_admin: false, deleted_at: null }, error: null },
    { data: { success: true, id: TARGET }, error: null }
  );
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
});

describe('POST /api/admin/users/[id]/delete', () => {
  it('gates on requireApiAdmin (is_app_admin), and never runs the RPC for a non-admin', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(403);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('deletes a regular account through admin_delete_user', async () => {
    const res = await call(TARGET);
    expect(res.status).toBe(200);
    expect(f.rpc).toHaveBeenCalledWith('admin_delete_user', { p_target_user_id: TARGET });
  });

  it('REFUSES deleting your own account', async () => {
    const res = await call(ADMIN);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'cannot_delete_self' });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('REFUSES deleting another admin', async () => {
    f = fakeService(
      { data: { id: TARGET, is_admin: true, deleted_at: null }, error: null },
      { data: null, error: null }
    );
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'target_is_admin' });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED when the admin check on the target errors', async () => {
    f = fakeService({ data: null, error: { message: 'boom' } }, { data: null, error: null });
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(500);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('returns 404 for an already-deleted account without re-running the cascade', async () => {
    f = fakeService(
      { data: { id: TARGET, is_admin: false, deleted_at: '2026-10-01T00:00:00Z' }, error: null },
      { data: null, error: null }
    );
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(404);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('reports a failed RPC result as a failure, not a success', async () => {
    f = fakeService(
      { data: { id: TARGET, is_admin: false, deleted_at: null }, error: null },
      { data: { success: false, error: 'something', code: 'XX000' }, error: null }
    );
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: f.service, userId: ADMIN } as never);
    const res = await call(TARGET);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
  });
});
