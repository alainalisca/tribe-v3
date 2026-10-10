import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import {
  requestAdminSessionDelete,
  requestAdminUserDelete,
  deleteSessionErrorMessage,
  deleteUserErrorMessage,
} from './adminDeleteRequests';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('requestAdminSessionDelete', () => {
  it('sends the scope and returns every deleted id', async () => {
    respond(200, { success: true, deletedIds: ['a', 'b'] });
    expect(await requestAdminSessionDelete('a', 'series')).toEqual({ ok: true, deletedIds: ['a', 'b'] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/sessions/a/delete');
    expect(JSON.parse(init.body)).toEqual({ scope: 'series' });
  });

  it('surfaces the server error code', async () => {
    respond(409, { error: 'has_payments' });
    expect(await requestAdminSessionDelete('a', 'single')).toEqual({ ok: false, error: 'has_payments' });
  });

  it('a 200 without success:true is NOT a success', async () => {
    respond(200, {});
    expect((await requestAdminSessionDelete('a', 'single')).ok).toBe(false);
  });

  it('a thrown fetch is reported as network', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await requestAdminUserDelete('u')).toEqual({ ok: false, error: 'network' });
  });
});

describe('error wording', () => {
  it('tells the admin to cancel a paid session instead', () => {
    expect(deleteSessionErrorMessage('has_payments', false)).toMatch(/Cancel it instead/);
    expect(deleteSessionErrorMessage('has_payments', true)).toMatch(/Cancélala/);
  });

  it('never claims "nothing was deleted" when the outcome is unknown', () => {
    expect(deleteSessionErrorMessage('network', false)).not.toMatch(/nothing was deleted/i);
    expect(deleteUserErrorMessage('network', false)).not.toMatch(/nothing was deleted/i);
  });

  it('explains the self and admin refusals', () => {
    expect(deleteUserErrorMessage('cannot_delete_self', false)).toMatch(/your own account/);
    expect(deleteUserErrorMessage('target_is_admin', false)).toMatch(/Admin accounts/);
  });
});
