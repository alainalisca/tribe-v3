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
    chain.lte = vi.fn().mockReturnValue(proxy);
    chain.gte = vi.fn().mockReturnValue(proxy);
    chain.order = vi.fn().mockReturnValue(result);
    chain.in = vi.fn().mockReturnValue(proxy);
    chain.ilike = vi.fn().mockReturnValue(proxy);
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

describe('POST /api/tribe-os/leads (duplicate phone 23505)', () => {
  it('returns existing_lead_id on 23505', async () => {
    const { POST } = await import('./route');

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tribe_os_leads') {
        callCount++;
        if (callCount === 1) {
          return chainable(null, { code: '23505', message: 'duplicate' });
        }
        const c = chainable([{ id: 'existing-lead-id' }]);
        return c;
      }
      return chainable([]);
    });

    const req = new Request('http://localhost/api/tribe-os/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Test', source: 'walk_in', phone: '+573001234567' }),
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('duplicate_phone');
    expect(json.existing_lead_id).toBe('existing-lead-id');
  });
});

describe('PATCH /api/tribe-os/leads/[id] trial_at required', () => {
  it('returns trial_at_required when trial_booked without trial_at', async () => {
    const { PATCH } = await import('./[id]/route');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tribe_os_leads') {
        return chainable({ status: 'new', trial_at: null, full_name: 'Test', phone: null, email: null });
      }
      return chainable(null);
    });

    const req = new Request('http://localhost/api/tribe-os/leads/lead-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'trial_booked' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'lead-1' }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('trial_at_required');
  });
});

describe('PATCH /api/tribe-os/leads/[id] conversion (joined)', () => {
  it('links existing client by phone', async () => {
    const { PATCH } = await import('./[id]/route');

    const updateChain = chainable({ id: 'lead-1', status: 'joined', converted_client_id: 'client-1' });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tribe_os_leads') {
        return chainable({ status: 'trial_done', trial_at: null, full_name: 'Maria', phone: '+573001234567', email: null });
      }
      if (table === 'clients') {
        return chainable([{ id: 'client-1' }]);
      }
      if (table === 'tribe_os_lead_activities') {
        return chainable({ id: 'act-1' });
      }
      return updateChain;
    });

    const req = new Request('http://localhost/api/tribe-os/leads/lead-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'joined' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'lead-1' }) });
    const json = await res.json();

    expect(json.success).toBe(true);
  });

  it('creates new client when no phone match', async () => {
    const { PATCH } = await import('./[id]/route');

    mockFrom.mockImplementation((table: string) => {
      if (table === 'tribe_os_leads') {
        return chainable({ status: 'trial_done', trial_at: null, full_name: 'Carlos', phone: '+573009999999', email: 'carlos@test.com' });
      }
      if (table === 'clients') {
        const callStack: unknown[] = [];
        const c = chainable(callStack.length === 0 ? [] : { id: 'new-client-id' });
        return c;
      }
      if (table === 'tribe_os_lead_activities') {
        return chainable({ id: 'act-1' });
      }
      return chainable({ id: 'lead-1', status: 'joined' });
    });

    const req = new Request('http://localhost/api/tribe-os/leads/lead-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'joined' }),
    });

    const res = await PATCH(req as any, { params: Promise.resolve({ id: 'lead-1' }) });
    const json = await res.json();

    expect(json.success).toBe(true);
  });
});

describe('computeFollowUp uses trial_at', () => {
  it('trial_booked follow-up is trial_at + 1 day', async () => {
    const { computeFollowUp } = await import('@/lib/tribe-os/leads/helpers');
    const now = new Date('2026-10-12T15:00:00Z');
    const trialAt = '2026-10-20T23:00:00Z';
    const result = computeFollowUp('trial_booked', now, trialAt);
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getUTCDate()).toBe(21);
  });
});

describe('nextStatusOptions allows joined from all open statuses', () => {
  it('new includes joined', async () => {
    const { nextStatusOptions } = await import('@/lib/tribe-os/leads/helpers');
    expect(nextStatusOptions('new')).toContain('joined');
  });

  it('contacted includes joined', async () => {
    const { nextStatusOptions } = await import('@/lib/tribe-os/leads/helpers');
    expect(nextStatusOptions('contacted')).toContain('joined');
  });

  it('trial_booked includes joined', async () => {
    const { nextStatusOptions } = await import('@/lib/tribe-os/leads/helpers');
    expect(nextStatusOptions('trial_booked')).toContain('joined');
  });

  it('trial_done includes joined', async () => {
    const { nextStatusOptions } = await import('@/lib/tribe-os/leads/helpers');
    expect(nextStatusOptions('trial_done')).toContain('joined');
  });
});

describe('pages call their routes', () => {
  it('leads list page imports required routes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/os/leads/page.tsx', 'utf-8');
    expect(src).toContain('/api/tribe-os/leads');
    expect(src).toContain('/api/tribe-os/leads/stats');
    expect(src).toContain('/api/tribe-os/coaches');
  });

  it('lead detail page imports required routes', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/os/leads/[id]/page.tsx', 'utf-8');
    expect(src).toContain('/api/tribe-os/leads/');
    expect(src).toContain('?preview=conversion');
    expect(src).toContain('/activities');
  });

  it('tasks page fetches lead tasks', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('app/os/tasks/page.tsx', 'utf-8');
    expect(src).toContain('/api/tribe-os/leads/tasks');
  });
});
