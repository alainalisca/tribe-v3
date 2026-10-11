import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));
vi.mock('@/lib/dal/adminSessionDelete', () => ({ adminDeleteSession: vi.fn() }));

import { POST } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { adminDeleteSession } from '@/lib/dal/adminSessionDelete';

const ID = '11111111-2222-3333-4444-555555555555';
const SERVICE = { tag: 'service' };

function call(id: string, body?: string) {
  const req = new Request(`https://x/api/admin/sessions/${id}/delete`, { method: 'POST', body });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service: SERVICE, userId: 'admin-1' } as never);
  vi.mocked(adminDeleteSession).mockResolvedValue({ success: true, data: { deletedIds: [ID], wasSeries: false } });
});

describe('POST /api/admin/sessions/[id]/delete', () => {
  it('NEVER reaches the delete when the caller is not an admin', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await call(ID);
    expect(res.status).toBe(403);
    expect(adminDeleteSession).not.toHaveBeenCalled();
  });

  it('deletes with the service client from the gate and the admin as actor', async () => {
    const res = await call(ID, JSON.stringify({ scope: 'series' }));
    expect(res.status).toBe(200);
    expect(adminDeleteSession).toHaveBeenCalledWith(SERVICE, ID, { scope: 'series', actorUserId: 'admin-1' });
    expect(await res.json()).toEqual({ success: true, deletedIds: [ID], wasSeries: false });
  });

  it('rejects a non-uuid id without touching the database', async () => {
    const res = await call('not-a-uuid');
    expect(res.status).toBe(400);
    expect(adminDeleteSession).not.toHaveBeenCalled();
  });

  it('rejects an unknown scope rather than treating it as single', async () => {
    const res = await call(ID, JSON.stringify({ scope: 'everything' }));
    expect(res.status).toBe(400);
    expect(adminDeleteSession).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const res = await call(ID, '{oops');
    expect(res.status).toBe(400);
    expect(adminDeleteSession).not.toHaveBeenCalled();
  });

  it.each([
    ['has_payments', 409],
    ['series_requires_scope', 409],
    ['linked_records', 409],
    ['session_not_found', 404],
    ['check_failed', 500],
  ] as const)('maps %s to %i', async (error, status) => {
    vi.mocked(adminDeleteSession).mockResolvedValue({ success: false, error });
    const res = await call(ID);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });
});
