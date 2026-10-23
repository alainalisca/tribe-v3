import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/account/deleteAccount', () => ({ deleteAccount: vi.fn() }));
const getUser = vi.fn();
const service = { auth: { getUser } };
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => service }));

import { POST } from './route';
import { deleteAccount } from '@/lib/account/deleteAccount';

/** T-DEL1: the in-app delete runs the one deletion path for the caller, and only the caller. */
const ME = '22222222-2222-4222-8222-222222222222';

function call(auth?: string) {
  return POST(
    new NextRequest('https://x/api/account/delete', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  vi.mocked(deleteAccount).mockResolvedValue({
    ok: true,
    filesDeleted: 0,
    notified: { sent: 0, suppressed: 0, no_token: 0, failed: 0 },
  });
});

describe('POST /api/account/delete', () => {
  it('refuses without a token, and deletes nothing', async () => {
    expect((await call()).status).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('refuses a token that does not verify, and deletes nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    expect((await call('Bearer x')).status).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the token's own account through the shared path", async () => {
    const res = await call('Bearer good');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteAccount).toHaveBeenCalledWith(service, ME);
  });

  it('reports the step a deletion stopped at', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'delete_files', error: 'storage down' });
    const res = await call('Bearer good');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'delete_failed', step: 'delete_files' });
  });

  it('tells a coach who owns a gym why', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ ok: false, step: 'check', error: 'owns_gym' });
    const res = await call('Bearer good');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: 'owns_gym', step: 'check' });
  });
});
