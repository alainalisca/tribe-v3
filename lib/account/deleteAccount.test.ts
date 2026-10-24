/**
 * T-DEL1: the one deletion path, against a fake service client. What the steps
 * do to a real database and real buckets is proved on the local stack by
 * deleteAccount.local.test.ts; this file proves the order and the stops: each
 * step checks its error, the first failure ends the run and names its step,
 * and nothing after it runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const ZERO = { sent: 0, suppressed: 0, no_token: 0, failed: 0 };
const { sendSessionCancelledPush } = vi.hoisted(() => ({ sendSessionCancelledPush: vi.fn() }));
const { cancelCoachPlanSubscriptionNow } = vi.hoisted(() => ({ cancelCoachPlanSubscriptionNow: vi.fn() }));
vi.mock('@/lib/payments/coachPlanStripe', () => ({ cancelCoachPlanSubscriptionNow }));
vi.mock('@/lib/notify/sessionCancelledPush', () => ({
  NO_CANCEL_PUSHES: { sent: 0, suppressed: 0, no_token: 0, failed: 0 },
  sendSessionCancelledPush,
}));

import { deleteAccount, DELETION_STEPS } from './deleteAccount';

const USER = '11111111-1111-4111-8111-111111111111';

type Err = { message: string; status?: number; code?: string } | null;

function fakeService(
  over: Partial<{
    user: { data: unknown; error: Err };
    gyms: { data: unknown; error: Err };
    partners: { data: unknown; error: Err };
    lists: Array<{ data: unknown; error: Err }>;
    remove: { error: Err };
    scrub: { error: Err };
    login: { error: Err };
    upcoming: { data: unknown; error: Err };
    spots: { data: unknown; error: Err };
    nowCancelled: { data: unknown; error: Err };
    refs: { data: unknown; error: Err };
  }> = {}
) {
  const calls: string[] = [];
  const lists = over.lists ?? [
    {
      data: [
        { bucket: 'profile-images', path: `avatars/${USER}/a.jpg` },
        { bucket: 'session-photos', path: `${USER}/s.jpg` },
      ],
      error: null,
    },
    { data: [], error: null },
  ];
  let listCall = 0;
  const removed: Array<[string, string[]]> = [];
  const service = {
    from: (table: string) => {
      let upcomingRead = false;
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: () => {
          upcomingRead = true;
          return chain;
        },
        // Awaited directly: the sessions and session_participants reads.
        then: (resolve: (v: unknown) => void) => {
          if (table === 'session_participants') {
            calls.push('read spots');
            return resolve(over.spots ?? { data: [], error: null });
          }
          calls.push(upcomingRead ? 'read upcoming sessions' : 'read which are cancelled now');
          return resolve(
            upcomingRead
              ? (over.upcoming ?? { data: [], error: null })
              : (over.nowCancelled ?? { data: [], error: null })
          );
        },
        limit: () => {
          calls.push(`read ${table}`);
          const owned = table === 'featured_partners' ? over.partners : over.gyms;
          return Promise.resolve(owned ?? { data: [], error: null });
        },
        maybeSingle: () => {
          calls.push(`read ${table}`);
          return Promise.resolve(over.user ?? { data: { id: USER }, error: null });
        },
      };
      return chain;
    },
    rpc: (fn: string) => {
      calls.push(`rpc ${fn}`);
      if (fn === 'account_deletion_files') return Promise.resolve(lists[Math.min(listCall++, lists.length - 1)]);
      if (fn === 'account_file_references') return Promise.resolve(over.refs ?? { data: [], error: null });
      return Promise.resolve(over.scrub ?? { error: null });
    },
    storage: {
      from: (bucket: string) => ({
        remove: (paths: string[]) => {
          calls.push(`remove ${bucket}`);
          removed.push([bucket, paths]);
          return Promise.resolve(over.remove ?? { error: null });
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: () => {
          calls.push('delete login');
          return Promise.resolve(over.login ?? { error: null });
        },
      },
    },
  };
  return { service: service as never, calls, removed };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendSessionCancelledPush.mockImplementation(async (_s, _session, athletes: string[]) => ({
    ...ZERO,
    sent: athletes.length,
  }));
});

describe('deleteAccount', () => {
  it('runs check, list, delete, list again, scrub, login, in that order', async () => {
    const f = fakeService();
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: true, filesDeleted: 2, filesKept: [], notified: ZERO });
    expect(f.calls).toEqual([
      'read users',
      'read gyms',
      'read featured_partners',
      'read upcoming sessions',
      'rpc account_file_references',
      'rpc account_deletion_files',
      'remove profile-images',
      'remove session-photos',
      'rpc account_deletion_files',
      'rpc account_scrub',
      'delete login',
    ]);
  });

  it('names seven steps, and the route reports exactly these', () => {
    expect(DELETION_STEPS).toEqual([
      'check',
      'cancel_plan',
      'list_files',
      'delete_files',
      'scrub_data',
      'notify',
      'delete_login',
    ]);
  });

  describe('T-PLAN1: a coach with a paid plan', () => {
    const PRO = { data: { id: USER, coach_plan_stripe_subscription_id: 'sub_pro_1' }, error: null };

    it('cancels the subscription in Stripe before anything of theirs is touched, then scrubs', async () => {
      const f = fakeService({ user: PRO });
      cancelCoachPlanSubscriptionNow.mockImplementation(async (id: string) => {
        f.calls.push(`stripe cancel ${id}`);
        return { success: true, alreadyGone: false };
      });
      expect(await deleteAccount(f.service, USER)).toEqual({
        ok: true,
        filesDeleted: 2,
        filesKept: [],
        notified: ZERO,
      });
      expect(cancelCoachPlanSubscriptionNow).toHaveBeenCalledTimes(1);
      expect(cancelCoachPlanSubscriptionNow).toHaveBeenCalledWith('sub_pro_1');
      expect(f.calls).toEqual([
        'read users',
        'read gyms',
        'read featured_partners',
        'read upcoming sessions',
        'stripe cancel sub_pro_1',
        'rpc account_file_references',
        'rpc account_deletion_files',
        'remove profile-images',
        'remove session-photos',
        'rpc account_deletion_files',
        'rpc account_scrub',
        'delete login',
      ]);
    });

    it('stops at cancel_plan with a clear error when Stripe refuses, and touches nothing', async () => {
      const f = fakeService({ user: PRO });
      cancelCoachPlanSubscriptionNow.mockResolvedValue({ success: false, error: 'Stripe is down' });
      expect(await deleteAccount(f.service, USER)).toEqual({
        ok: false,
        step: 'cancel_plan',
        error: 'coach_plan_cancel_failed: Stripe is down',
      });
      expect(f.calls).not.toContain('rpc account_deletion_files');
      expect(f.calls).not.toContain('rpc account_scrub');
      expect(f.calls).not.toContain('delete login');
      expect(f.removed).toEqual([]);
    });

    it('a subscription already canceled (a rerun) counts as done', async () => {
      const f = fakeService({ user: PRO });
      cancelCoachPlanSubscriptionNow.mockResolvedValue({ success: true, alreadyGone: true });
      expect((await deleteAccount(f.service, USER)).ok).toBe(true);
      expect(f.calls).toContain('rpc account_scrub');
    });

    it('a coach with no Stripe plan (basico, or a comp) never calls Stripe', async () => {
      const f = fakeService({ user: { data: { id: USER, coach_plan_stripe_subscription_id: null }, error: null } });
      expect((await deleteAccount(f.service, USER)).ok).toBe(true);
      expect(cancelCoachPlanSubscriptionNow).not.toHaveBeenCalled();
    });
  });

  it('removes in batches of 100 per bucket', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      bucket: 'profile-images',
      path: `photos/${USER}/p${i}.jpg`,
    }));
    const f = fakeService({
      lists: [
        { data: many, error: null },
        { data: [], error: null },
      ],
    });
    expect(await deleteAccount(f.service, USER)).toEqual({
      ok: true,
      filesDeleted: 250,
      filesKept: [],
      notified: ZERO,
    });
    expect(f.removed.map(([, p]) => p.length)).toEqual([100, 100, 50]);
  });

  it('T-DEL2: a file another row still uses is reported as kept and never removed', async () => {
    const shared = { bucket: 'profile-images', path: `avatars/${USER}-logo.jpeg` };
    const f = fakeService({
      // 230: the listing already leaves the shared file out; the references name it.
      refs: {
        data: [{ ...shared, ref_table: 'featured_partners', ref_column: 'logo_url', ref_id: 'p1' }],
        error: null,
      },
    });
    const out = await deleteAccount(f.service, USER);
    expect(out).toEqual({
      ok: true,
      filesDeleted: 2,
      filesKept: [{ ...shared, table: 'featured_partners', column: 'logo_url', rowId: 'p1' }],
      notified: ZERO,
    });
    expect(f.removed.flatMap(([, p]) => p)).not.toContain(shared.path);
  });

  const stops: Array<[string, Parameters<typeof fakeService>[0], string, string]> = [
    ['no users row', { user: { data: null, error: null } }, 'check', 'read users'],
    ['the users read fails', { user: { data: null, error: { message: 'boom' } } }, 'check', 'read users'],
    ['the account owns a gym', { gyms: { data: [{ id: 'g1' }], error: null } }, 'check', 'read gyms'],
    [
      'the account owns a partner listing',
      { partners: { data: [{ id: 'p1' }], error: null } },
      'check',
      'read featured_partners',
    ],
    [
      'the shared-file check fails',
      { refs: { data: null, error: { message: 'boom' } } },
      'list_files',
      'rpc account_file_references',
    ],
    [
      'the listing fails',
      { lists: [{ data: null, error: { message: 'boom' } }] },
      'list_files',
      'rpc account_deletion_files',
    ],
    ['a remove fails', { remove: { error: { message: 'storage down' } } }, 'delete_files', 'remove profile-images'],
    [
      'a file is still there after the delete',
      {
        lists: [
          { data: [{ bucket: 'media', path: 'x' }], error: null },
          { data: [{ bucket: 'media', path: 'x' }], error: null },
        ],
      },
      'delete_files',
      'rpc account_deletion_files',
    ],
    ['the scrub fails', { scrub: { error: { message: 'guard' } } }, 'scrub_data', 'rpc account_scrub'],
    [
      'the login delete fails',
      { login: { error: { message: 'auth down', status: 500 } } },
      'delete_login',
      'delete login',
    ],
  ];

  for (const [what, over, step, lastCall] of stops) {
    it(`stops at ${step} when ${what}, and runs nothing after it`, async () => {
      const f = fakeService(over);
      const out = await deleteAccount(f.service, USER);
      expect(out).toMatchObject({ ok: false, step });
      expect(f.calls.at(-1)).toBe(lastCall);
    });
  }

  it('says owns_gym, so the routes can tell the person why', async () => {
    const out = await deleteAccount(fakeService({ gyms: { data: [{ id: 'g1' }], error: null } }).service, USER);
    expect(out).toEqual({ ok: false, step: 'check', error: 'owns_gym' });
  });

  it('says owns_partner for a partner-listing owner, and deletes nothing', async () => {
    const f = fakeService({ partners: { data: [{ id: 'p1' }], error: null } });
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: false, step: 'check', error: 'owns_partner' });
    expect(f.calls).not.toContain('rpc account_deletion_files');
  });

  it('a login that is already gone counts as done: a rerun finishes a delete that stopped there', async () => {
    const f = fakeService({ login: { error: { message: 'User not found', status: 404 } } });
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: true, filesDeleted: 2, filesKept: [], notified: ZERO });
  });
  describe('notify: the athletes of upcoming sessions the deletion cancels', () => {
    const S1 = { id: 's1', creator_id: USER, title: null, sport: 'Boxing', date: '2099-01-01', is_paid: false };
    const S2 = { id: 's2', creator_id: USER, title: 'Yoga', sport: 'Yoga', date: '2099-01-02', is_paid: true };
    const spots = {
      data: [
        { session_id: 's1', user_id: 'ana' },
        { session_id: 's1', user_id: 'ben' },
        { session_id: 's1', user_id: null }, // a door guest: no account to notify
        { session_id: 's1', user_id: USER }, // the host
        { session_id: 's2', user_id: 'ana' },
      ],
      error: null,
    };

    it('after the scrub and before the login goes, only for sessions now cancelled, never the host or a guest', async () => {
      const f = fakeService({
        upcoming: { data: [S1, S2], error: null },
        spots,
        nowCancelled: { data: [{ id: 's1' }], error: null },
      });
      const out = await deleteAccount(f.service, USER);
      expect(out).toEqual({ ok: true, filesDeleted: 2, filesKept: [], notified: { ...ZERO, sent: 2 } });
      expect(sendSessionCancelledPush).toHaveBeenCalledTimes(1);
      expect(sendSessionCancelledPush).toHaveBeenCalledWith(f.service, S1, ['ana', 'ben'], 'account-deletion');
      const order = f.calls;
      expect(order.indexOf('rpc account_scrub')).toBeLessThan(order.indexOf('read which are cancelled now'));
      expect(order.indexOf('read which are cancelled now')).toBeLessThan(order.indexOf('delete login'));
    });

    it("adds up every session's outcomes", async () => {
      sendSessionCancelledPush
        .mockResolvedValueOnce({ ...ZERO, sent: 1, no_token: 1 })
        .mockResolvedValueOnce({ ...ZERO, suppressed: 1 });
      const f = fakeService({
        upcoming: { data: [S1, S2], error: null },
        spots,
        nowCancelled: { data: [{ id: 's1' }, { id: 's2' }], error: null },
      });
      expect(await deleteAccount(f.service, USER)).toMatchObject({
        ok: true,
        notified: { sent: 1, no_token: 1, suppressed: 1, failed: 0 },
      });
    });

    it('a rerun tells nobody twice: the sessions are no longer active, so nothing is noted', async () => {
      const f = fakeService({ upcoming: { data: [], error: null } });
      expect(await deleteAccount(f.service, USER)).toEqual({
        ok: true,
        filesDeleted: 2,
        filesKept: [],
        notified: ZERO,
      });
      expect(sendSessionCancelledPush).not.toHaveBeenCalled();
      expect(f.calls).not.toContain('read spots');
    });

    it('one push failing is counted, and the deletion still finishes', async () => {
      sendSessionCancelledPush.mockResolvedValueOnce({ ...ZERO, failed: 2 });
      const f = fakeService({
        upcoming: { data: [S1], error: null },
        spots,
        nowCancelled: { data: [{ id: 's1' }], error: null },
      });
      expect(await deleteAccount(f.service, USER)).toMatchObject({ ok: true, notified: { failed: 2 } });
      expect(f.calls.at(-1)).toBe('delete login');
    });

    it('a failed read of the upcoming sessions stops at check, before anything is deleted', async () => {
      const f = fakeService({ upcoming: { data: null, error: { message: 'boom' } } });
      expect(await deleteAccount(f.service, USER)).toMatchObject({ ok: false, step: 'check' });
      expect(f.calls).not.toContain('rpc account_deletion_files');
    });

    it('a failed read of the athletes stops at check, before anything is deleted', async () => {
      const f = fakeService({
        upcoming: { data: [S1], error: null },
        spots: { data: null, error: { message: 'boom' } },
      });
      expect(await deleteAccount(f.service, USER)).toMatchObject({ ok: false, step: 'check' });
      expect(f.calls).not.toContain('rpc account_deletion_files');
    });

    it('a failed re-read after the scrub stops at notify, and the login stays for a rerun', async () => {
      const f = fakeService({
        upcoming: { data: [S1], error: null },
        spots,
        nowCancelled: { data: null, error: { message: 'boom' } },
      });
      expect(await deleteAccount(f.service, USER)).toMatchObject({ ok: false, step: 'notify' });
      expect(f.calls).not.toContain('delete login');
      expect(sendSessionCancelledPush).not.toHaveBeenCalled();
    });
  });
});
