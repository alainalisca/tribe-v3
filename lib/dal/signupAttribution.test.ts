import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The write's WHERE clause is the first half of "written once" (migration
 * 214's trigger is the second). Route tests mock this module, so these arms
 * are the only place the filters are pinned: each would fail if its filter
 * were dropped, which is the mutation they exist for.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { recordSignupAttribution, fetchUserCreatedAt } from './signupAttribution';
import { logError } from '@/lib/logger';
import type { SignupAttributionFields } from '@/lib/signupAttribution';

const FIELDS: SignupAttributionFields = {
  signup_src: 'ig',
  signup_code: 'IG-REEL-01',
  signup_ref: null,
  signup_utm_source: null,
  signup_utm_medium: null,
  signup_utm_campaign: null,
  signup_utm_content: null,
  signup_landing_path: '/',
  signup_first_touch: null,
};

function chain(result: { data: unknown; error: unknown }) {
  const c = {
    update: vi.fn(() => c),
    eq: vi.fn(() => c),
    is: vi.fn(() => c),
    gte: vi.fn(() => c),
    select: vi.fn(() => Promise.resolve(result)),
  };
  return { client: { from: vi.fn(() => c) } as never, c };
}

beforeEach(() => vi.clearAllMocks());

describe('recordSignupAttribution', () => {
  it('writes only an unstamped row inside the window, and stamps it server side', async () => {
    const { client, c } = chain({ data: [{ id: 'u1' }], error: null });
    const r = await recordSignupAttribution(client, 'u1', FIELDS, '2026-10-02T00:00:00.000Z');

    expect(r).toEqual({ success: true, data: 'recorded' });
    expect(c.eq).toHaveBeenCalledWith('id', 'u1');
    expect(c.is).toHaveBeenCalledWith('signup_attributed_at', null);
    expect(c.gte).toHaveBeenCalledWith('created_at', '2026-10-02T00:00:00.000Z');
    const written = (c.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(written).toMatchObject(FIELDS);
    expect(typeof written.signup_attributed_at).toBe('string');
  });

  it('reports "already" when the filters matched no row', async () => {
    const { client } = chain({ data: [], error: null });
    expect(await recordSignupAttribution(client, 'u1', FIELDS, 'x')).toEqual({ success: true, data: 'already' });
  });

  it('recognises a database error, logs it, and does not report success', async () => {
    const { client } = chain({ data: null, error: { message: 'trigger refused' } });
    const r = await recordSignupAttribution(client, 'u1', FIELDS, 'x');
    expect(r.success).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'trigger refused' }),
      expect.objectContaining({ action: 'recordSignupAttribution' })
    );
  });
});

describe('fetchUserCreatedAt', () => {
  it('returns epoch ms, and null for a missing row', async () => {
    const make = (data: unknown) => {
      const c = { select: vi.fn(() => c), eq: vi.fn(() => c), maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })) };
      return { from: vi.fn(() => c) } as never;
    };
    expect(await fetchUserCreatedAt(make({ created_at: '2026-10-09T15:00:00.000Z' }), 'u1')).toEqual({
      success: true,
      data: Date.UTC(2026, 9, 9, 15),
    });
    expect(await fetchUserCreatedAt(make(null), 'u1')).toEqual({ success: true, data: null });
  });
});
