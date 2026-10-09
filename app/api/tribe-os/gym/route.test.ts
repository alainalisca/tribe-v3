import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal/auditLog', () => ({ writeAuditEntry: vi.fn() }));

const mockRpc = vi.fn();
const mockGetGym = vi.fn();
const mockGetGymForUser = vi.fn();

vi.mock('@/lib/dal/gyms', () => ({
  getGym: (...args: unknown[]) => mockGetGym(...args),
  getGymForUser: (...args: unknown[]) => mockGetGymForUser(...args),
  updateGym: vi.fn(),
}));

vi.mock('@/lib/auth/premium', () => ({
  requireTribeOSPremium: vi.fn().mockResolvedValue({
    ok: true,
    supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
    userId: 'user-1',
    gymId: 'gym-1',
  }),
}));

const GYM_ROW = {
  id: 'gym-1',
  name: 'Old Name',
  slug: 'old-name',
  owner_user_id: 'user-1',
  timezone: 'America/Bogota',
  default_currency: 'COP',
  intelligence_email_enabled: true,
  tribe_os_status: 'active',
  tribe_os_tier: 'solo',
  tribe_os_stripe_customer_id: null,
  tribe_os_stripe_subscription_id: null,
  tribe_os_granted_at: null,
  tribe_os_granted_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/tribe-os/gym', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/tribe-os/gym — RPC error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGym.mockResolvedValue({ success: true, data: GYM_ROW });
  });

  it('returns 200 on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...GYM_ROW, name: 'New Name' }], error: null });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'New Name' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('maps owner_only to 403', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'owner_only', code: 'P0003' } });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('owner_only');
  });

  it('maps gym_not_found to 404', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'gym_not_found', code: 'P0002' } });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('gym_not_found');
  });

  it('maps invalid_name to 400', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_name', code: 'P0006' } });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid_name');
  });

  it('maps invalid_currency to 400', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'invalid_currency: must be USD or COP', code: 'P0004' },
    });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('invalid_currency');
  });

  it('maps invalid_timezone to 400 with message', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'invalid_timezone: Foo/Bar', code: 'P0005' },
    });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('invalid_timezone');
    expect(json.error).toContain('Foo/Bar');
  });

  it('maps unknown RPC errors to 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'something unexpected', code: '42000' } });
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest({ name: 'X' }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('update_failed');
  });
});
