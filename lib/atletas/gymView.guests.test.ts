/**
 * T-AV26 and T-AV27a: which guests a filter shows, and in what order. Split
 * from gymView.test.ts (T-AV27c) to keep each file under 300 lines.
 *
 * Mutation proofs (t-av27a-mutations.LOCAL.sh, arm A7):
 *   - "Abiertos" admits closed guests -> "Abiertos: came with no outcome first" RED
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GUEST_FILTER,
  GUESTS_PAGE_SIZE,
  guestsForFilter,
  matchesGuestFilter,
  type GymGuestRow,
} from './gymView';

describe('matchesGuestFilter', () => {
  const row = (over: Partial<GymGuestRow>): GymGuestRow => ({
    leadId: 'l',
    firstName: 'X',
    passCode: 'AV-XXXX',
    claimedAt: '2026-09-29T14:00:00Z',
    attendedAt: null,
    outcome: null,
    retainedAt: null,
    athleteFirstName: 'Ana',
    credited: true,
    noCreditReason: null,
    ...over,
  });
  const claimed = row({});
  const came = row({ attendedAt: '2026-09-29T15:00:00Z' });
  const joined = row({ attendedAt: '2026-09-29T15:00:00Z', outcome: 'joined' });
  const member = row({ attendedAt: '2026-09-29T15:00:00Z', outcome: 'already_member' });

  it('all, open, expected, came and members select by the summary fields', () => {
    const pick = (f: Parameters<typeof matchesGuestFilter>[1]) =>
      [claimed, came, joined, member].filter((g) => matchesGuestFilter(g, f));
    expect(pick('all')).toHaveLength(4);
    expect(pick('open')).toEqual([claimed, came]);
    expect(pick('expected')).toEqual([claimed]);
    expect(pick('came')).toEqual([came, joined, member]);
    expect(pick('members')).toEqual([joined]);
  });
});

describe('T-AV27a: the Invitados default view', () => {
  const row = (leadId: string, over: Partial<GymGuestRow>): GymGuestRow => ({
    leadId,
    firstName: leadId,
    passCode: `AV-${leadId}`,
    claimedAt: '2026-09-29T14:00:00Z',
    attendedAt: null,
    outcome: null,
    retainedAt: null,
    athleteFirstName: 'Ana',
    credited: true,
    noCreditReason: null,
    ...over,
  });
  // The summary's own order: newest claim first.
  const summaryOrder = [
    row('expected1', {}),
    row('came1', { attendedAt: '2026-09-29T15:00:00Z' }),
    row('closed', { attendedAt: '2026-09-28T15:00:00Z', outcome: 'not_now' }),
    row('expected2', {}),
    row('came2', { attendedAt: '2026-09-27T15:00:00Z' }),
  ];
  const ids = (rows: GymGuestRow[]) => rows.map((r) => r.leadId);

  it('opens on "Abiertos", 20 rows at a time', () => {
    expect(DEFAULT_GUEST_FILTER).toBe('open');
    expect(GUESTS_PAGE_SIZE).toBe(20);
  });

  it('"Abiertos": came with no outcome first, then not yet arrived, each in summary order; no closed guest', () => {
    expect(ids(guestsForFilter(summaryOrder, 'open'))).toEqual(['came1', 'came2', 'expected1', 'expected2']);
  });

  it('every other filter keeps the summary order', () => {
    expect(ids(guestsForFilter(summaryOrder, 'all'))).toEqual(ids(summaryOrder));
    expect(ids(guestsForFilter(summaryOrder, 'came'))).toEqual(['came1', 'closed', 'came2']);
  });
});
