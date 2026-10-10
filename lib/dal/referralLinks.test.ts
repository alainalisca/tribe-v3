import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
import { linkSignupReferral } from './referralLinks';
import { logError } from '@/lib/logger';

function client(owner: { referrer_id: string } | null, insertError: { code?: string; message: string } | null = null) {
  const lookup = {
    select: vi.fn(() => lookup),
    eq: vi.fn(() => lookup),
    is: vi.fn(() => lookup),
    limit: vi.fn(() => lookup),
    maybeSingle: vi.fn(async () => ({ data: owner, error: null })),
  };
  const insert = vi.fn(async () => ({ error: insertError }));
  const from = vi.fn(() => ({ ...lookup, insert }));
  return { c: { from } as never, lookup, insert };
}

beforeEach(() => vi.clearAllMocks());

describe('linkSignupReferral', () => {
  it('finds the owner of the CODE ROW and writes the credit as signed_up', async () => {
    const { c, lookup, insert } = client({ referrer_id: 'ref-1' });
    expect(await linkSignupReferral(c, 'TRIBE-AB2CD', 'new-1')).toEqual({ success: true, data: 'linked' });
    expect(lookup.eq).toHaveBeenCalledWith('referral_code', 'TRIBE-AB2CD');
    expect(lookup.is).toHaveBeenCalledWith('referred_id', null);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ referrer_id: 'ref-1', referred_id: 'new-1', referral_code: 'TRIBE-AB2CD', status: 'signed_up' })
    );
  });

  it('never credits a person for their own code', async () => {
    const { c, insert } = client({ referrer_id: 'me' });
    expect(await linkSignupReferral(c, 'TRIBE-AB2CD', 'me')).toEqual({ success: true, data: 'self' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('no owner (a lead code, or a typo): nothing written, not an error', async () => {
    const { c, insert } = client(null);
    expect(await linkSignupReferral(c, 'KQ7M2Z', 'new-1')).toEqual({ success: true, data: 'no_referrer' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('23505 from the one-credit index is "already", not a failure', async () => {
    const { c } = client({ referrer_id: 'ref-1' }, { code: '23505', message: 'dup' });
    expect(await linkSignupReferral(c, 'TRIBE-AB2CD', 'new-1')).toEqual({ success: true, data: 'already' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('any other insert error is recognised and logged', async () => {
    const { c } = client({ referrer_id: 'ref-1' }, { code: '42501', message: 'rls' });
    const r = await linkSignupReferral(c, 'TRIBE-AB2CD', 'new-1');
    expect(r.success).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ code: '42501' }), expect.any(Object));
  });
});
