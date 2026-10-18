import { describe, it, expect, vi, beforeEach } from 'vitest';

/** T-JOIN1b: only the host and the admins may open a test session. */
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
const state = { user: null as null | { id: string }, admin: false, fail: false };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    if (state.fail) throw new Error('cookies unavailable');
    return {
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      rpc: async () => ({ data: state.admin, error: null }),
    };
  },
}));

import { viewerCanSeeTestSession } from './testSessionAccess';

beforeEach(() => Object.assign(state, { user: null, admin: false, fail: false }));

describe('viewerCanSeeTestSession', () => {
  it('the host can', async () => {
    state.user = { id: 'host' };
    expect(await viewerCanSeeTestSession('host')).toBe(true);
  });
  it('an admin can', async () => {
    state.user = { id: 'admin' };
    state.admin = true;
    expect(await viewerCanSeeTestSession('host')).toBe(true);
  });
  it('another signed-in user cannot', async () => {
    state.user = { id: 'someone' };
    expect(await viewerCanSeeTestSession('host')).toBe(false);
  });
  it('a signed-out visitor cannot', async () => {
    expect(await viewerCanSeeTestSession('host')).toBe(false);
  });
  it('a failure answers no', async () => {
    state.fail = true;
    expect(await viewerCanSeeTestSession('host')).toBe(false);
  });
});
