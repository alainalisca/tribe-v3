/**
 * The weekly recap: a recurring email that read no preference and carried no
 * way out.
 *
 * TYPE_META has declared weekly_recap as email:'opt_in' -- affirmative consent
 * AND the weekly_recap category -- for as long as the delivery-policy model has
 * existed. This route read nothing and emailed every user with an address. The
 * declared policy and the code disagreed and the code won, which is the exact
 * gap that makes a policy model a document rather than an invariant.
 *
 * It has never carried an unsubscribe link, because until migration 188 there
 * was nothing in the app to link to.
 *
 * It is not scheduled. Its only caller, /api/cron/weekly, is one of the five
 * cron routes absent from vercel.json, so these emails have never gone out --
 * which makes now the cheapest possible moment to fix it, not a reason not to.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: vi.fn(() => true) }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/time/bogotaDate', () => ({ bogotaDateOffset: () => '2026-09-14' }));
vi.mock('@/lib/dal', () => ({
  fetchUsersForEmailJobs: vi.fn(),
  fetchParticipationsWithSession: vi.fn(),
  fetchSessionsByCreator: vi.fn(),
}));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn() }));
vi.mock('@/lib/dal/emailUnsubscribe', async () => ({
  isEmailSuppressed: vi.fn(),
  unsubUrlFor: vi.fn(),
  unsubHeaders: (await vi.importActual<typeof import('@/lib/dal/emailUnsubscribe')>('@/lib/dal/emailUnsubscribe'))
    .unsubHeaders,
}));

import { POST } from './route';
import { fetchUsersForEmailJobs, fetchParticipationsWithSession, fetchSessionsByCreator } from '@/lib/dal';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { isEmailSuppressed, unsubUrlFor } from '@/lib/dal/emailUnsubscribe';

const req = () =>
  new Request('https://x/api/send-weekly-recap', { method: 'POST', headers: { Authorization: 'Bearer s' } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'k';
  vi.mocked(fetchUsersForEmailJobs).mockResolvedValue({
    success: true,
    data: [{ id: 'u1', email: 'a@b.co', name: 'Ana', preferred_language: 'es' }],
  } as never);
  // At least one session, or the route skips the user before any gate: it has
  // nothing to recap. A fixture of zero sessions would have made every
  // "did not send" case below pass for the wrong reason.
  vi.mocked(fetchParticipationsWithSession).mockResolvedValue({
    success: true,
    data: [
      {
        session: {
          id: 's1',
          sport: 'Running',
          location: 'Laureles',
          date: '2026-09-16',
          start_time: '06:00',
          creator: { name: 'Al' },
        },
      },
    ],
  } as never);
  vi.mocked(fetchSessionsByCreator).mockResolvedValue({ success: true, data: [] } as never);
  vi.mocked(shouldSendNotification).mockResolvedValue(true);
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
  vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x/api/unsubscribe?token=tok' });
});

describe('the weekly recap honours preferences and carries a way out', () => {
  it('NON-VACUITY: it does send when everything permits', async () => {
    // Without this, every "did not send" case below is satisfied by a route
    // that sends to nobody for an unrelated reason.
    const body = await (await POST(req())).json();
    expect(body.emailsSent).toBe(1);
    expect(send).toHaveBeenCalledOnce();
  });

  it('asks the declared policy for weekly_recap on the EMAIL channel', async () => {
    await POST(req());
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'u1', 'weekly_recap', 'email');
  });

  it('sends nothing when the policy says no', async () => {
    vi.mocked(shouldSendNotification).mockResolvedValue(false);
    const body = await (await POST(req())).json();
    expect(send).not.toHaveBeenCalled();
    expect(body.suppressed).toBe(1);
    expect(body.emailsSent).toBe(0);
  });

  it('sends nothing to somebody who unsubscribed', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    const body = await (await POST(req())).json();
    expect(send).not.toHaveBeenCalled();
    expect(body.suppressed).toBe(1);
  });

  it('the opt-out is checked BEFORE the policy, because it outranks it', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    await POST(req());
    // An unsubscribed person should not even have their policy consulted: the
    // answer cannot change the outcome, and asking implies it might.
    expect(shouldSendNotification).not.toHaveBeenCalled();
  });

  it('NO LINK MEANS NO SEND', async () => {
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: null });
    const body = await (await POST(req())).json();
    expect(send).not.toHaveBeenCalled();
    expect(body.errors).toBe(1);
  });

  it('a FAILED token read does not send either', async () => {
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: false, error: 'db down' });
    const body = await (await POST(req())).json();
    expect(send).not.toHaveBeenCalled();
    expect(body.errors).toBe(1);
  });

  it('what goes out carries a real unsubscribe anchor and the one-click headers', async () => {
    await POST(req());
    const arg = send.mock.calls[0][0];
    // An <a href>, not the URL appearing anywhere: a broken anchor still
    // contains the string, which is a detector matching a name rather than
    // asking whether the thing is clickable.
    expect(arg.html).toMatch(/<a\s+href="https:\/\/x\/api\/unsubscribe\?token=tok"/);
    expect(arg.headers['List-Unsubscribe']).toBe('<https://x/api/unsubscribe?token=tok>');
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('a quiet week is not counted as an opt-out', async () => {
    vi.mocked(fetchParticipationsWithSession).mockResolvedValue({ success: true, data: [] } as never);
    const body = await (await POST(req())).json();
    expect(send).not.toHaveBeenCalled();
    expect(body.suppressed).toBe(0);
    expect(body.errors).toBe(0);
  });

  it('a bad secret reads nothing and sends nothing', async () => {
    const { isValidCronAuth } = await import('@/lib/auth/cron');
    vi.mocked(isValidCronAuth).mockReturnValue(false);
    expect((await POST(req())).status).toBe(401);
    expect(fetchUsersForEmailJobs).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
