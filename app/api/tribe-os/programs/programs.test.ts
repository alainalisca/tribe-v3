import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockLogError = vi.fn();

const mockSupabase = {
  from: mockFrom,
};

vi.mock('@/lib/auth/premium', () => ({
  requireTribeOSPremium: vi.fn().mockResolvedValue({
    ok: true,
    supabase: mockSupabase,
    userId: 'user-1',
    gymId: 'gym-1',
    response: undefined,
  }),
}));
vi.mock('@/lib/logger', () => ({ logError: mockLogError }));
vi.mock('@/lib/tribe-os/dates', () => ({
  bogotaToday: () => '2026-10-13',
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
function chainable(data: unknown = null, error: unknown = null) {
  const result = { data, error };
  const chain: Record<string, any> = {};
  const makeChain = (): any => {
    const proxy = new Proxy(chain, {
      get(target, prop) {
        if (prop === 'then' || prop === 'catch') return undefined;
        if (typeof prop === 'symbol') return undefined;
        if (prop in target) return target[prop];
        return (..._args: unknown[]) => proxy;
      },
    });
    chain.single = vi.fn().mockReturnValue(result);
    chain.limit = vi.fn().mockReturnValue({ ...result, single: chain.single });
    chain.select = vi.fn().mockReturnValue(proxy);
    chain.eq = vi.fn().mockReturnValue(proxy);
    chain.not = vi.fn().mockReturnValue(proxy);
    chain.is = vi.fn().mockReturnValue(proxy);
    chain.lte = vi.fn().mockReturnValue(proxy);
    chain.gte = vi.fn().mockReturnValue(proxy);
    chain.in = vi.fn().mockReturnValue(proxy);
    chain.order = vi.fn().mockReturnValue(result);
    chain.insert = vi.fn().mockReturnValue(proxy);
    chain.update = vi.fn().mockReturnValue(proxy);
    return proxy;
  };
  return makeChain();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
});

// ── POST /api/tribe-os/programs ──────────────────────────────────────

describe('POST /api/tribe-os/programs (create)', () => {
  it('creates a program with valid input', async () => {
    const { POST } = await import('./route');

    mockFrom.mockReturnValue(
      chainable({
        id: 'prog-1',
        name: 'HYROX 8 Weeks',
        status: 'draft',
        gym_id: 'gym-1',
      }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HYROX 8 Weeks',
        sport: 'HYROX',
        status: 'draft',
        starts_at: '2026-11-01',
        ends_at: '2026-12-27',
        target_sessions_per_week: 4,
      }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('HYROX 8 Weeks');
  });

  it('rejects empty name', async () => {
    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/tribe-os/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_name');
  });

  it('rejects target_sessions_per_week > 14', async () => {
    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/tribe-os/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', target_sessions_per_week: 15 }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('invalid_target');
  });

  it('returns error response when Supabase insert fails', async () => {
    const { POST } = await import('./route');

    mockFrom.mockReturnValue(
      chainable(null, { code: '42501', message: 'RLS violation' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Program', status: 'draft' }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('create_failed');
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ code: '42501' }),
      expect.objectContaining({ route: 'POST /api/tribe-os/programs' }),
    );
  });
});

// ── POST /api/tribe-os/programs/[id]/members (assign) ────────────────

describe('POST /api/tribe-os/programs/[id]/members (assign)', () => {
  it('assigns a member', async () => {
    const { POST } = await import('./[id]/members/route');

    mockFrom.mockReturnValue(
      chainable({ id: 'mem-1', program_id: 'prog-1', client_id: 'client-1' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'client-1' }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 409 on duplicate assignment (23505)', async () => {
    const { POST } = await import('./[id]/members/route');

    mockFrom.mockReturnValue(
      chainable(null, { code: '23505', message: 'duplicate' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'client-1' }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('already_assigned');
  });

  it('rejects missing client_id', async () => {
    const { POST } = await import('./[id]/members/route');

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('missing_client_id');
  });
});

// ── PATCH /api/tribe-os/programs/[id]/members (soft-remove) ──────────

describe('PATCH /api/tribe-os/programs/[id]/members (soft-remove)', () => {
  it('soft-removes a member by setting removed_at', async () => {
    const { PATCH } = await import('./[id]/members/route');

    mockFrom.mockReturnValue(
      chainable({ id: 'mem-1', removed_at: '2026-10-13T12:00:00Z' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: 'mem-1' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.removed_at).toBeTruthy();
  });

  it('returns error when Supabase update fails', async () => {
    const { PATCH } = await import('./[id]/members/route');

    mockFrom.mockReturnValue(
      chainable(null, { code: 'PGRST116', message: 'not found' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: 'mem-999' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('remove_failed');
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PGRST116' }),
      expect.objectContaining({ route: 'PATCH /api/tribe-os/programs/[id]/members' }),
    );
  });

  it('rejects missing member_id', async () => {
    const { PATCH } = await import('./[id]/members/route');

    const req = new Request('http://localhost/api/tribe-os/programs/prog-1/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'prog-1' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('missing_member_id');
  });
});

// ── GET /api/tribe-os/programs/[id] (Supabase error surfaced) ────────

describe('GET /api/tribe-os/programs/[id] (error handling)', () => {
  it('returns 404 with error when Supabase returns error', async () => {
    const { GET } = await import('./[id]/route');

    mockFrom.mockReturnValue(
      chainable(null, { code: 'PGRST116', message: 'row not found' }),
    );

    const req = new Request('http://localhost/api/tribe-os/programs/bad-id');

    const res = await GET(req as any, { params: Promise.resolve({ id: 'bad-id' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error).toBe('not_found');
    expect(mockLogError).toHaveBeenCalled();
  });
});
