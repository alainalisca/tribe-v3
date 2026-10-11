import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorResponse } from 'resend';
import type { ContactsClient } from '@/lib/email/resendClient';
import type { AppMember } from './contactSyncPlan';

const fetchNewsletterAudience = vi.fn();
const setEmailUnsubscribed = vi.fn();
const logError = vi.fn();

vi.mock('@/lib/dal/newsletterAudience', () => ({
  fetchNewsletterAudience: (...a: unknown[]) => fetchNewsletterAudience(...a),
}));
vi.mock('@/lib/dal/emailUnsubscribe', () => ({
  setEmailUnsubscribed: (...a: unknown[]) => setEmailUnsubscribed(...a),
}));
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a), log: vi.fn() }));

import { runContactSync, MAX_RESEND_WRITES, CALL_SPACING_MS } from './contactSync';

const supabase = {} as SupabaseClient;
const noSleep = vi.fn(async () => {});

const member = (i: number, over: Partial<AppMember> = {}): AppMember => ({
  userId: `u${i}`,
  email: `p${i}@x.com`,
  firstName: `P${i}`,
  role: 'athlete',
  suppressed: false,
  eligible: true,
  ...over,
});

interface FakeContact {
  id: string;
  email: string;
  unsubscribed: boolean;
}

type C = ContactsClient['contacts'];

/** A typed contacts client. No casts: if this stops matching ContactsClient, the test fails to compile. */
function fakeClient(contacts: FakeContact[], pageSize = 100) {
  const list = vi.fn<C['list']>(async (opts) => {
    const after = opts && 'after' in opts ? opts.after : undefined;
    const start = after ? contacts.findIndex((c) => c.id === after) + 1 : 0;
    const page = contacts.slice(start, start + pageSize).map((c) => ({
      ...c,
      created_at: '2026-10-11',
      first_name: null,
      last_name: null,
    }));
    return {
      data: { object: 'list', data: page, has_more: start + pageSize < contacts.length },
      error: null,
      headers: null,
    };
  });
  const create = vi.fn<C['create']>(async () => ({
    data: { object: 'contact', id: 'new' },
    error: null,
    headers: null,
  }));
  const update = vi.fn<C['update']>(async (p) => ({
    data: { object: 'contact', id: 'id' in p && p.id ? p.id : '' },
    error: null,
    headers: null,
  }));
  const remove = vi.fn<C['remove']>(async () => ({
    data: { object: 'contact', deleted: true, contact: 'x' },
    error: null,
    headers: null,
  }));
  const client: ContactsClient & {
    contacts: { list: typeof list; create: typeof create; update: typeof update; remove: typeof remove };
  } = {
    contacts: { list, create, update, remove },
  };
  return client;
}

const created = (id: string): Awaited<ReturnType<C['create']>> => ({
  data: { object: 'contact', id },
  error: null,
  headers: null,
});
const failed = (
  name: ErrorResponse['name'],
  statusCode: number,
  message: string
): Awaited<ReturnType<C['create']>> => ({
  data: null,
  error: { name, statusCode, message },
  headers: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  setEmailUnsubscribed.mockResolvedValue({ success: true, data: null });
});

describe('runContactSync', () => {
  it('pulls, pushes, removes and creates, and reports each count', async () => {
    fetchNewsletterAudience.mockResolvedValue({
      success: true,
      data: [member(1), member(2, { suppressed: true }), member(3)],
    });
    const client = fakeClient([
      { id: 'c1', email: 'p1@x.com', unsubscribed: true }, // pull
      { id: 'c2', email: 'p2@x.com', unsubscribed: false }, // push
      { id: 'c9', email: 'gone@x.com', unsubscribed: false }, // remove
      // p3 has no contact: create
    ]);
    const s = await runContactSync(supabase, client, noSleep);

    expect(setEmailUnsubscribed).toHaveBeenCalledWith(supabase, 'u1');
    expect(client.contacts.update).toHaveBeenCalledWith({ id: 'c2', unsubscribed: true });
    expect(client.contacts.remove).toHaveBeenCalledWith({ id: 'c9' });
    expect(client.contacts.create).toHaveBeenCalledWith({
      email: 'p3@x.com',
      unsubscribed: false,
      firstName: 'P3',
      properties: { role: 'athlete' },
    });
    expect(s).toMatchObject({
      appMembers: 3,
      resendContacts: 3,
      pulled: 1,
      pushed: 1,
      removed: 1,
      created: 1,
      failed: 0,
      deferred: 0,
    });
  });

  it('reads every page of the contact list, following the cursor', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [] });
    const contacts = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, email: `p${i}@x.com`, unsubscribed: false }));
    const client = fakeClient(contacts, 2);
    const s = await runContactSync(supabase, client, noSleep);
    expect(s.resendContacts).toBe(5);
    expect(client.contacts.list).toHaveBeenCalledTimes(3);
    expect(client.contacts.list).toHaveBeenNthCalledWith(2, { limit: 100, after: 'c1' });
  });

  it('a failed audience read throws before any write, and never touches Resend writes', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: false, error: 'Failed to read the newsletter audience' });
    const client = fakeClient([{ id: 'c1', email: 'p1@x.com', unsubscribed: false }]);
    await expect(runContactSync(supabase, client, noSleep)).rejects.toThrow(/audience/);
    expect(client.contacts.remove).not.toHaveBeenCalled();
    expect(client.contacts.create).not.toHaveBeenCalled();
  });

  it('one failed write is logged and the rest still run', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [member(1), member(2), member(3)] });
    const client = fakeClient([]);
    client.contacts.create
      .mockResolvedValueOnce(created('a'))
      .mockResolvedValueOnce(failed('validation_error', 422, 'bad address'))
      .mockResolvedValueOnce(created('c'));
    const s = await runContactSync(supabase, client, noSleep);
    expect(client.contacts.create).toHaveBeenCalledTimes(3);
    expect(s).toMatchObject({ created: 2, failed: 1, deferred: 0 });
    // the failure was RECOGNISED, carrying Resend's reason, not just absorbed
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'bad address' }),
      expect.objectContaining({ action: 'contactSync_created' })
    );
  });

  it('a thrown write is contained the same way', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [member(1), member(2)] });
    const client = fakeClient([]);
    client.contacts.create.mockRejectedValueOnce(new Error('fetch failed'));
    const s = await runContactSync(supabase, client, noSleep);
    expect(s).toMatchObject({ created: 1, failed: 1 });
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'fetch failed' }), expect.anything());
  });

  it('a 429 stops the run for today and leaves the rest deferred', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [member(1), member(2), member(3), member(4)] });
    const client = fakeClient([]);
    client.contacts.create
      .mockResolvedValueOnce(created('a'))
      .mockResolvedValueOnce(failed('rate_limit_exceeded', 429, 'slow down'));
    const s = await runContactSync(supabase, client, noSleep);
    expect(client.contacts.create).toHaveBeenCalledTimes(2);
    expect(s).toMatchObject({ created: 1, failed: 0, rateLimited: true, deferred: 3 });
  });

  it('caps Resend writes per run and defers the remainder', async () => {
    const n = MAX_RESEND_WRITES + 7;
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: Array.from({ length: n }, (_, i) => member(i)) });
    const client = fakeClient([]);
    const s = await runContactSync(supabase, client, noSleep);
    expect(client.contacts.create).toHaveBeenCalledTimes(MAX_RESEND_WRITES);
    expect(s).toMatchObject({ created: MAX_RESEND_WRITES, deferred: 7 });
  });

  it('pulls are never capped: every newsletter unsubscribe reaches the app', async () => {
    const n = MAX_RESEND_WRITES + 5;
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: Array.from({ length: n }, (_, i) => member(i)) });
    const client = fakeClient(
      Array.from({ length: n }, (_, i) => ({ id: `c${i}`, email: `p${i}@x.com`, unsubscribed: true }))
    );
    const s = await runContactSync(supabase, client, noSleep);
    expect(setEmailUnsubscribed).toHaveBeenCalledTimes(n);
    expect(s.pulled).toBe(n);
  });

  it('a failed pull is logged and counted, and the others still land', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [member(1), member(2)] });
    setEmailUnsubscribed.mockResolvedValueOnce({ success: false, error: 'permission denied' });
    const client = fakeClient([
      { id: 'c1', email: 'p1@x.com', unsubscribed: true },
      { id: 'c2', email: 'p2@x.com', unsubscribed: true },
    ]);
    const s = await runContactSync(supabase, client, noSleep);
    expect(s).toMatchObject({ pulled: 1, failed: 1 });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'permission denied' }),
      expect.objectContaining({ action: 'contactSync_pull' })
    );
  });

  it('a refused plan makes no Resend writes and reports why', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [] });
    const client = fakeClient(
      Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, email: `p${i}@x.com`, unsubscribed: false }))
    );
    const s = await runContactSync(supabase, client, noSleep);
    expect(s.refused).toMatch(/would remove 80 of 80/);
    expect(client.contacts.remove).not.toHaveBeenCalled();
    expect(s.deferred).toBe(0);
  });

  it('waits before every Resend call, list and write alike', async () => {
    fetchNewsletterAudience.mockResolvedValue({ success: true, data: [member(1), member(2)] });
    const client = fakeClient([]);
    const sleep = vi.fn(async () => {});
    await runContactSync(supabase, client, sleep);
    // one list page + two creates
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(CALL_SPACING_MS);
  });
});
