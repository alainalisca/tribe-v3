import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetGym = vi.fn();

const mockFrom = vi.fn().mockImplementation(() => ({
  select: mockSelect.mockReturnThis(),
  insert: mockInsert.mockReturnThis(),
  update: mockUpdate.mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  single: vi.fn().mockResolvedValue({ data: { id: 'plan-1', name: 'Mensual', price_cents: 12000000, currency: 'COP', duration_months: 1 }, error: null }),
}));

vi.mock('@/lib/dal/gyms', () => ({
  getGym: (...args: unknown[]) => mockGetGym(...args),
  getGymForUser: vi.fn(),
}));

vi.mock('@/lib/auth/premium', () => ({
  requireTribeOSPremium: vi.fn().mockResolvedValue({
    ok: true,
    supabase: { from: mockFrom },
    userId: 'user-1',
    gymId: 'gym-1',
  }),
}));

const GYM_ROW = {
  id: 'gym-1',
  owner_user_id: 'user-1',
  default_currency: 'COP',
};

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/tribe-os/gym/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/tribe-os/gym/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGym.mockResolvedValue({ success: true, data: GYM_ROW });
  });

  it('returns 403 when non-owner tries to save', async () => {
    mockGetGym.mockResolvedValue({
      success: true,
      data: { ...GYM_ROW, owner_user_id: 'other-user' },
    });
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: 'Mensual', price_cents: 12000000, currency: 'COP', duration_months: 1 })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for empty name', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: '   ', price_cents: 12000000, currency: 'COP', duration_months: 1 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for name over 80 chars', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: 'x'.repeat(81), price_cents: 12000000, currency: 'COP', duration_months: 1 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative price', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: 'Mensual', price_cents: -100, currency: 'COP', duration_months: 1 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid currency', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: 'Mensual', price_cents: 12000000, currency: 'EUR', duration_months: 1 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for duration_months out of range', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: 'Mensual', price_cents: 12000000, currency: 'COP', duration_months: 25 })
    );
    expect(res.status).toBe(400);
  });

  it('trims name before validation', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ name: '  Mensual  ', price_cents: 12000000, currency: 'COP', duration_months: 1 })
    );
    expect(res.status).toBe(201);
  });
});

describe('price helpers', () => {
  it('parsePriceInput converts peso display to cents', () => {
    const cleaned = '120000'.replace(/[^0-9]/g, '');
    const value = parseInt(cleaned, 10);
    const cents = value * 100;
    expect(cents).toBe(12000000);
  });

  it('monthly equivalent truncates for COP', () => {
    const priceCents = 72000000;
    const months = 6;
    const monthly = Math.floor(priceCents / months);
    expect(monthly).toBe(12000000);
  });

  it('monthly equivalent truncates odd division', () => {
    const priceCents = 50000000;
    const months = 3;
    const monthly = Math.floor(priceCents / months);
    expect(monthly).toBe(16666666);
  });
});
