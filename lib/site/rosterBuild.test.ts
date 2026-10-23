import { describe, it, expect } from 'vitest';
import { balancedColumns, buildRoster, initialsOf, type RosterSessionRow } from './rosterBuild';
import { addDays } from './rosterDates';

/** T-SITE1.1 Part C: who is on the live roster, what each card says, in what order. */
const TODAY = '2026-10-17';

type Over = Partial<RosterSessionRow> & {
  id?: string;
  name?: string;
  instructor?: boolean;
  joined?: string;
  flags?: Partial<NonNullable<RosterSessionRow['creator']>>;
};
function session({
  id = 'c1',
  name = 'Andrés Varón',
  instructor = true,
  joined = '2026-01-01',
  flags,
  ...rest
}: Over = {}) {
  return {
    sport: 'Yoga',
    date: addDays(TODAY, -3),
    status: 'active',
    partner_status: null,
    partner: null,
    creator: {
      id,
      name,
      avatar_url: `https://x.supabase.co/storage/v1/object/public/avatars/${id}.jpg`,
      is_test_account: false,
      banned: false,
      deleted_at: null,
      is_instructor: instructor,
      created_at: joined,
      ...flags,
    },
    ...rest,
  } satisfies RosterSessionRow;
}

describe('who is on the roster', () => {
  it('listed instructors with an active session in the last 60 days, upcoming ones included', () => {
    const roster = buildRoster(
      [
        session({ id: 'recent' }),
        session({ id: 'upcoming', date: addDays(TODAY, 5) }),
        session({ id: 'edge', date: addDays(TODAY, -60) }),
        session({ id: 'stale', date: addDays(TODAY, -61) }),
        session({ id: 'cancelled', status: 'cancelled' }),
        session({ id: 'athlete', instructor: false }),
        session({ id: 'admin', flags: { is_admin: true } as never }),
        session({ id: 'test', flags: { is_test_account: true } }),
        session({ id: 'banned', flags: { banned: true } }),
        session({ id: 'deleted', flags: { deleted_at: '2026-10-01T00:00:00Z' } }),
        { ...session(), creator: null },
      ],
      TODAY
    );
    // An admin who coaches is on the roster like anyone (T-JOIN1b).
    expect(roster.map((c) => c.id).sort()).toEqual(['admin', 'edge', 'recent', 'upcoming']);
  });

  it('one card per coach however many sessions', () => {
    expect(buildRoster([session(), session(), session({ sport: 'Pilates' })], TODAY)).toHaveLength(1);
  });
});

describe('what a card says', () => {
  it('first name and last initial, initials, the public coach page', () => {
    const [c] = buildRoster([session({ id: 'u1', name: 'Andrés Varón Gómez' })], TODAY);
    expect(c).toMatchObject({ name: 'Andrés V.', initials: 'AV', href: '/i/u1/' });
    expect(initialsOf('Lissete')).toBe('L');
    expect(initialsOf('  ')).toBe('');
  });

  it('the sport of most of their sessions; "Other" only when it is all they teach', () => {
    const [c] = buildRoster(
      [session({ sport: 'Other' }), session({ sport: 'Other' }), session({ sport: 'Boxing' })],
      TODAY
    );
    expect(c.sport).toBe('Boxing');
    expect(buildRoster([session({ sport: 'Other' })], TODAY)[0].sport).toBe('Other');
  });

  it('the approved, active partner gym most sessions are at; otherwise no place, never the profile', () => {
    const bb = { business_name: 'CrossFit BullBox', status: 'active' };
    const [atGym] = buildRoster(
      [session({ partner_status: 'approved', partner: bb }), session({ partner_status: 'approved', partner: bb })],
      TODAY
    );
    expect(atGym.place).toBe('CrossFit BullBox');
    const [pending] = buildRoster([session({ partner_status: 'pending', partner: bb })], TODAY);
    expect(pending.place).toBeNull();
    const [paused] = buildRoster(
      [session({ partner_status: 'approved', partner: { ...bb, status: 'paused' } })],
      TODAY
    );
    expect(paused.place).toBeNull();
    expect(Object.keys(atGym)).not.toContain('location');
  });
});

describe('the order', () => {
  it('most sessions in the last 30 days first, upcoming ones not counted; then the newest coach', () => {
    const roster = buildRoster(
      [
        session({ id: 'busy', date: addDays(TODAY, -1) }),
        session({ id: 'busy', date: addDays(TODAY, -2) }),
        session({ id: 'busy', date: addDays(TODAY, -40) }),
        session({ id: 'once', date: addDays(TODAY, -10) }),
        session({ id: 'future-old', date: addDays(TODAY, 3), joined: '2025-01-01' }),
        session({ id: 'future-new', date: addDays(TODAY, 3), joined: '2026-09-01' }),
      ],
      TODAY
    );
    expect(roster.map((c) => [c.id, c.recent])).toEqual([
      ['busy', 2],
      ['once', 1],
      ['future-new', 0],
      ['future-old', 0],
    ]);
  });
});

describe('balanced columns (site polish)', () => {
  it.each([
    [0, 6, 1],
    [3, 6, 3],
    [6, 6, 6],
    [7, 6, 4],
    [8, 6, 4],
    [9, 6, 5],
    [12, 6, 6],
    [13, 6, 5],
    [9, 4, 3],
    [5, 4, 3],
  ])('%i cards, at most %i across: %i columns', (n, max, cols) => {
    expect(balancedColumns(n, max)).toBe(cols);
  });

  it('never leaves the last row less than half full when it can be avoided', () => {
    for (let n = 1; n <= 24; n++) {
      const cols = balancedColumns(n, 6);
      expect(cols).toBeLessThanOrEqual(6);
      const last = n % cols || cols;
      expect(last * 2, `n=${n}`).toBeGreaterThanOrEqual(cols - 1);
    }
  });
});
