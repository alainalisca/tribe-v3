/**
 * T-DEL1: the one deletion path, against a fake service client. What the steps
 * do to a real database and real buckets is proved on the local stack by
 * deleteAccount.local.test.ts; this file proves the order and the stops: each
 * step checks its error, the first failure ends the run and names its step,
 * and nothing after it runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { deleteAccount, DELETION_STEPS } from './deleteAccount';

const USER = '11111111-1111-4111-8111-111111111111';

type Err = { message: string; status?: number; code?: string } | null;

function fakeService(
  over: Partial<{
    user: { data: unknown; error: Err };
    gyms: { data: unknown; error: Err };
    lists: Array<{ data: unknown; error: Err }>;
    remove: { error: Err };
    scrub: { error: Err };
    login: { error: Err };
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
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => {
          calls.push(`read ${table}`);
          return Promise.resolve(over.gyms ?? { data: [], error: null });
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

beforeEach(() => vi.clearAllMocks());

describe('deleteAccount', () => {
  it('runs check, list, delete, list again, scrub, login, in that order', async () => {
    const f = fakeService();
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: true, filesDeleted: 2 });
    expect(f.calls).toEqual([
      'read users',
      'read gyms',
      'rpc account_deletion_files',
      'remove profile-images',
      'remove session-photos',
      'rpc account_deletion_files',
      'rpc account_scrub',
      'delete login',
    ]);
  });

  it('names five steps, and the route reports exactly these', () => {
    expect(DELETION_STEPS).toEqual(['check', 'list_files', 'delete_files', 'scrub_data', 'delete_login']);
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
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: true, filesDeleted: 250 });
    expect(f.removed.map(([, p]) => p.length)).toEqual([100, 100, 50]);
  });

  const stops: Array<[string, Parameters<typeof fakeService>[0], string, string]> = [
    ['no users row', { user: { data: null, error: null } }, 'check', 'read users'],
    ['the users read fails', { user: { data: null, error: { message: 'boom' } } }, 'check', 'read users'],
    ['the account owns a gym', { gyms: { data: [{ id: 'g1' }], error: null } }, 'check', 'read gyms'],
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

  it('a login that is already gone counts as done: a rerun finishes a delete that stopped there', async () => {
    const f = fakeService({ login: { error: { message: 'User not found', status: 404 } } });
    expect(await deleteAccount(f.service, USER)).toEqual({ ok: true, filesDeleted: 2 });
  });
});
