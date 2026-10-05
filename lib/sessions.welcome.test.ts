/**
 * T-AV33 (P1-6). joinSession asks for the coach's welcome note after a
 * CONFIRMED join only. A pending request (curated or paid) is not a join yet.
 * The route decides the rest; this pins only when the client asks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal', () => ({ fetchSessionFields: vi.fn(), checkExistingParticipation: vi.fn() }));

import { joinSession } from './sessions';
import { fetchSessionFields, checkExistingParticipation } from '@/lib/dal';

const fetchSpy = vi.fn().mockResolvedValue({ ok: true });

function supabase() {
  return { rpc: vi.fn(async () => ({ data: { success: true, participant_id: 'pp-1' }, error: null })) };
}

function welcomeCalls() {
  return fetchSpy.mock.calls.filter((c) => String(c[0]).startsWith('/api/coach-welcome'));
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = fetchSpy as never;
  vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
});

describe('joinSession and the welcome note', () => {
  it('asks for the welcome after a confirmed join, with only the session id', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: {
        id: 's1',
        creator_id: 'c1',
        join_policy: 'open',
        max_participants: 10,
        current_participants: 1,
        status: 'active',
      },
    } as never);
    const res = await joinSession({ supabase: supabase() as never, sessionId: 's1', userId: 'u1', userName: 'Ana' });
    expect(res).toEqual({ success: true, status: 'confirmed' });
    expect(welcomeCalls()).toHaveLength(1);
    const [url, init] = welcomeCalls()[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/coach-welcome/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ sessionId: 's1' });
  });

  it('does not ask after a pending request (curated)', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: {
        id: 's1',
        creator_id: 'c1',
        join_policy: 'curated',
        max_participants: 10,
        current_participants: 1,
        status: 'active',
      },
    } as never);
    const res = await joinSession({ supabase: supabase() as never, sessionId: 's1', userId: 'u1', userName: 'Ana' });
    expect(res.status).toBe('pending');
    expect(welcomeCalls()).toHaveLength(0);
  });

  it('does not ask when the join failed', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: {
        id: 's1',
        creator_id: 'c1',
        join_policy: 'open',
        max_participants: 10,
        current_participants: 1,
        status: 'active',
      },
    } as never);
    const s = { rpc: vi.fn(async () => ({ data: { success: false, error: 'Session is full' }, error: null })) };
    await joinSession({ supabase: s as never, sessionId: 's1', userId: 'u1', userName: 'Ana' });
    expect(welcomeCalls()).toHaveLength(0);
  });
});
