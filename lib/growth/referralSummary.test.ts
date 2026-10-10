import { describe, it, expect } from 'vitest';
import { summarizeReferrals, type CodeOwner } from './referralSummary';

const LEAD_A: CodeOwner = { code: 'KQ7M2Z', kind: 'lead', label: 'Ana', email: 'ana@x.co', phone: '+573001112233' };
const USER_B: CodeOwner = { code: 'TRIBE-AB2CD', kind: 'user', label: 'Beto', email: 'beto@x.co', phone: null };

describe('summarizeReferrals', () => {
  it('spec DoD: A shares, B claims with A\'s code, Leo marks B attended -> A: 1 lead, 1 attended', () => {
    const rows = summarizeReferrals(
      [LEAD_A],
      [{ ref: 'KQ7M2Z', email: 'b@x.co', phone: '+573009998877', attended: true }],
      []
    );
    expect(rows).toEqual([
      { code: 'KQ7M2Z', kind: 'lead', referrer: 'Ana', leads: 1, attended: 1, signups: 0, selfExcluded: 0 },
    ]);
  });

  it('self-referral by the SAME PHONE written differently is not counted, and is shown as Self', () => {
    const rows = summarizeReferrals(
      [LEAD_A],
      [{ ref: 'KQ7M2Z', email: 'other@x.co', phone: '300 111 2233', attended: true }],
      []
    );
    expect(rows[0]).toMatchObject({ leads: 0, attended: 0, selfExcluded: 1 });
  });

  it('self-referral by the same email, any casing, is not counted (signups too)', () => {
    const rows = summarizeReferrals([USER_B], [], [{ ref: 'TRIBE-AB2CD', email: ' BETO@X.CO ', phone: null }]);
    expect(rows[0]).toMatchObject({ signups: 0, selfExcluded: 1 });
  });

  it('counts signups per code, matching codes case-insensitively', () => {
    const rows = summarizeReferrals([USER_B], [], [{ ref: 'tribe-ab2cd', email: 'new@x.co', phone: null }]);
    expect(rows[0]).toMatchObject({ code: 'TRIBE-AB2CD', kind: 'user', referrer: 'Beto', signups: 1 });
  });

  it('an unowned code is still a row, marked unknown, never dropped', () => {
    const rows = summarizeReferrals([], [{ ref: 'ZZZZZZ', email: null, phone: null, attended: false }], []);
    expect(rows).toEqual([
      { code: 'ZZZZZZ', kind: 'unknown', referrer: null, leads: 1, attended: 0, signups: 0, selfExcluded: 0 },
    ]);
  });

  it('a missing phone or email never matches another missing one', () => {
    const owner: CodeOwner = { ...USER_B, email: null };
    const rows = summarizeReferrals([owner], [], [{ ref: 'TRIBE-AB2CD', email: null, phone: null }]);
    expect(rows[0]).toMatchObject({ signups: 1, selfExcluded: 0 });
  });

  it('orders by leads, then signups', () => {
    const rows = summarizeReferrals(
      [LEAD_A, USER_B],
      [{ ref: 'KQ7M2Z', email: 'q@x.co', phone: null, attended: false }],
      [
        { ref: 'TRIBE-AB2CD', email: 's1@x.co', phone: null },
        { ref: 'TRIBE-AB2CD', email: 's2@x.co', phone: null },
      ]
    );
    expect(rows.map((r) => r.code)).toEqual(['KQ7M2Z', 'TRIBE-AB2CD']);
  });
});
