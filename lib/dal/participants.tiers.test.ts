import { describe, it, expect, vi } from 'vitest';
import { computeCoAthleteTiers, tierFor, fetchCoAthleteTiers } from './participants';

/**
 * T-ATH1 tiers 2 and 3.
 *
 * MEASURED AGAINST PRODUCTION BEFORE THESE WERE WRITTEN, 2026-09-17:
 *   tier 3 (past co-attendance) : 30 of 94 athletes have at least one, up to 13
 *   tier 2 (upcoming)           : 0 of 94 -- ZERO
 *
 * Tier 2 is empty in production because all 26 upcoming sessions currently have
 * no confirmed participants, so the only person on each is its host and a set of
 * one produces no pairs. The code path is therefore UNEXERCISED BY REAL DATA,
 * which is exactly the situation where "it returned nothing and did not throw"
 * gets mistaken for "it works". So tier 2 is asserted here on fixtures, in both
 * directions, and the emptiness is recorded as a fact about the data rather than
 * a property of the code.
 */

const VIEWER = 'viewer-1';
const TODAY = '2026-09-17';

type Row = Parameters<typeof computeCoAthleteTiers>[0][number];

const row = (sessionId: string, userId: string | null, date: string, creatorId: string, status = 'active'): Row => ({
  user_id: userId,
  session_id: sessionId,
  sessions: { date, status, creator_id: creatorId },
});

describe('computeCoAthleteTiers', () => {
  it('puts a co-participant on a future session in tier 2', () => {
    const t = computeCoAthleteTiers(
      [row('s1', VIEWER, '2026-12-01', 'host-1'), row('s1', 'athlete-2', '2026-12-01', 'host-1')],
      VIEWER,
      TODAY
    );
    expect(t.upcoming.has('athlete-2')).toBe(true);
    expect(tierFor('athlete-2', t)).toBe(2);
  });

  it('puts a co-participant on a past session in tier 3', () => {
    const t = computeCoAthleteTiers(
      [row('s1', VIEWER, '2026-03-01', 'host-1'), row('s1', 'athlete-2', '2026-03-01', 'host-1')],
      VIEWER,
      TODAY
    );
    expect(tierFor('athlete-2', t)).toBe(3);
  });

  /**
   * THE HOST CASE. A host holds no participant row (T-ATH7), so if the tier were
   * derived from participant rows alone, training with an instructor -- most of
   * what Tribe is -- would leave the instructor a stranger.
   */
  it('reaches the HOST of a session the viewer attends, who has no participant row', () => {
    const t = computeCoAthleteTiers([row('s1', VIEWER, '2026-12-01', 'instructor-9')], VIEWER, TODAY);
    expect(tierFor('instructor-9', t)).toBe(2);
  });

  it('reaches an athlete on a session the viewer HOSTS', () => {
    // The viewer is the creator; their own participant row does not exist.
    const t = computeCoAthleteTiers([row('s1', 'athlete-2', '2026-12-01', VIEWER)], VIEWER, TODAY);
    expect(tierFor('athlete-2', t)).toBe(2);
  });

  it('never tiers the viewer against themselves', () => {
    const t = computeCoAthleteTiers(
      [row('s1', VIEWER, '2026-12-01', 'host-1'), row('s1', 'athlete-2', '2026-12-01', 'host-1')],
      VIEWER,
      TODAY
    );
    expect(t.upcoming.has(VIEWER)).toBe(false);
    expect(t.past.has(VIEWER)).toBe(false);
    expect(tierFor(VIEWER, t)).toBe(1);
  });

  it('leaves an athlete with no shared session at tier 1', () => {
    const t = computeCoAthleteTiers([row('s1', VIEWER, '2026-12-01', 'host-1')], VIEWER, TODAY);
    expect(tierFor('stranger-7', t)).toBe(1);
  });

  it('prefers upcoming over past when a pair shares both', () => {
    const t = computeCoAthleteTiers(
      [
        row('past', VIEWER, '2026-03-01', 'host-1'),
        row('past', 'athlete-2', '2026-03-01', 'host-1'),
        row('soon', VIEWER, '2026-12-01', 'host-1'),
        row('soon', 'athlete-2', '2026-12-01', 'host-1'),
      ],
      VIEWER,
      TODAY
    );
    expect(tierFor('athlete-2', t)).toBe(2);
    // Still recorded in both sets; only the tier resolution prefers one.
    expect(t.past.has('athlete-2')).toBe(true);
  });

  it('treats a CANCELLED future session as history, not as a shared plan', () => {
    const t = computeCoAthleteTiers(
      [
        row('s1', VIEWER, '2026-12-01', 'host-1', 'cancelled'),
        row('s1', 'athlete-2', '2026-12-01', 'host-1', 'cancelled'),
      ],
      VIEWER,
      TODAY
    );
    expect(t.upcoming.has('athlete-2')).toBe(false);
    expect(tierFor('athlete-2', t)).toBe(3);
  });

  it('treats a session dated today as upcoming', () => {
    const t = computeCoAthleteTiers(
      [row('s1', VIEWER, TODAY, 'host-1'), row('s1', 'athlete-2', TODAY, 'host-1')],
      VIEWER,
      TODAY
    );
    expect(tierFor('athlete-2', t)).toBe(2);
  });

  it('ignores guest rows, which have no profile to tier', () => {
    const t = computeCoAthleteTiers(
      [row('s1', VIEWER, '2026-12-01', 'host-1'), row('s1', null, '2026-12-01', 'host-1')],
      VIEWER,
      TODAY
    );
    expect(t.upcoming.size).toBe(1); // host-1 only
    expect(t.upcoming.has('host-1')).toBe(true);
  });

  /**
   * THE ADMIN CASE, and the reason this is not paranoia: there is exactly ONE
   * admin among 107 live users, and it is the person most likely to be testing
   * this on their own phone. migration 152 grants admins every roster row for
   * moderation, so without the membership filter an admin's tier map would
   * contain the entire app and every stranger would read as tier 3 -- on the
   * one account whose result nobody would think to doubt.
   */
  it('ignores sessions the viewer is not on, which is what an admin sees', () => {
    const t = computeCoAthleteTiers(
      [
        // Somebody else's session entirely -- visible only via the admin branch.
        row('theirs', 'athlete-2', '2026-12-01', 'host-1'),
        row('theirs', 'athlete-3', '2026-12-01', 'host-1'),
        // One the viewer is genuinely on.
        row('mine', VIEWER, '2026-12-01', 'host-4'),
      ],
      VIEWER,
      TODAY
    );
    expect(tierFor('athlete-2', t)).toBe(1);
    expect(tierFor('athlete-3', t)).toBe(1);
    expect(tierFor('host-4', t)).toBe(2);
  });
});

describe('fetchCoAthleteTiers', () => {
  function client(result: { data?: unknown; error?: unknown }) {
    const eq = vi.fn().mockResolvedValue(result);
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    return { client: { from } as never, from, select, eq };
  }

  it('reads the roster view unfiltered by session, and only confirmed rows', async () => {
    const { client: c, from, select, eq } = client({ data: [], error: null });
    await fetchCoAthleteTiers(c, VIEWER);

    expect(from).toHaveBeenCalledWith('session_participants_roster');
    expect(eq).toHaveBeenCalledWith('status', 'confirmed');

    // The embed must be disambiguated: PostgREST finds three candidate
    // relationships to sessions and returns PGRST201 without the hint. And it
    // must carry creator_id, or hosts are unreachable.
    const selected = select.mock.calls[0][0] as string;
    expect(selected).toContain('sessions!session_participants_session_id_fkey');
    expect(selected).toContain('creator_id');
  });

  it('surfaces a query error rather than returning empty tiers', async () => {
    const { client: c } = client({ data: null, error: { message: 'permission denied' } });
    const r = await fetchCoAthleteTiers(c, VIEWER);
    // An empty result and a failed query mean very different things here: the
    // view returns zero rows for a service-role caller WITHOUT erroring, so a
    // real error must never be flattened into "this athlete knows nobody".
    expect(r.success).toBe(false);
    expect(r.success === false && r.error).toContain('permission denied');
  });

  it('maps rows through the grouping', async () => {
    const { client: c } = client({
      data: [row('s1', VIEWER, '2099-01-01', 'host-1'), row('s1', 'athlete-2', '2099-01-01', 'host-1')],
      error: null,
    });
    const r = await fetchCoAthleteTiers(c, VIEWER);
    expect(r.success).toBe(true);
    expect(r.success && r.data?.upcoming.has('athlete-2')).toBe(true);
  });
});
