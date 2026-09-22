import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();

// Mocks (declared before importing the route).
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: () => true }));
vi.mock('@/lib/time/bogotaDate', () => ({ bogotaDateOffset: () => '2026-05-15' }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
// Class (not an arrow fn) so `new Resend(key)` works as a constructor.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock('@/lib/dal', () => ({
  fetchUsersForReengagementEmail: vi.fn(),
  fetchParticipationsWithSession: vi.fn(async () => ({ success: true, data: [] })),
  fetchSessionsByCreator: vi.fn(async () => ({ success: true, data: [] })),
  updateUser: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn() }));
vi.mock('@/lib/dal/emailUnsubscribe', async () => ({
  isEmailSuppressed: vi.fn(async () => false),
  unsubUrlFor: vi.fn(async () => ({ success: true, data: 'https://x/api/unsubscribe?token=tok' })),
  // The REAL header builder. Mocking it would assert the mock's idea of
  // RFC 8058 rather than the headers that actually go out.
  unsubHeaders: (await vi.importActual<typeof import('@/lib/dal/emailUnsubscribe')>('@/lib/dal/emailUnsubscribe'))
    .unsubHeaders,
}));

import { POST } from './route';
import {
  fetchUsersForReengagementEmail,
  fetchParticipationsWithSession,
  fetchSessionsByCreator,
  updateUser,
} from '@/lib/dal';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { isEmailSuppressed, unsubUrlFor } from '@/lib/dal/emailUnsubscribe';

process.env.RESEND_API_KEY = 'test-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';

function makeRequest(): Request {
  return new Request('http://localhost/api/send-inactive-nudge', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

function usr(id: string) {
  return { id, email: `${id}@x.com`, name: id, preferred_language: 'en', created_at: '2025-01-01T00:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  (fetchUsersForReengagementEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [usr('u1')] });
  (fetchParticipationsWithSession as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [] });
  (fetchSessionsByCreator as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [] });
  (shouldSendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  // Re-set every implementation, not just the call history. vi.clearAllMocks()
  // clears calls and instances and LEAVES mockResolvedValue in place, so a
  // case that sets the opt-out to true leaks into every case after it -- which
  // is how three unrelated tests started failing when two were added.
  vi.mocked(isEmailSuppressed).mockResolvedValue(false);
  vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: 'https://x/api/unsubscribe?token=tok' });
  sendMock.mockResolvedValue({ id: 'email-1' });
});

describe('send-inactive-nudge: dedup, cap, gating, stamp', () => {
  it('requests a bounded, deduped audience: created > 14 days, reengagement > 30 days, cap 150', async () => {
    await POST(makeRequest());
    const opts = (fetchUsersForReengagementEmail as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.limit).toBe(150);
    // reengagementBefore is ~30 days back; createdBefore ~14 days back.
    const now = Date.now();
    const daysBack = (iso: string) => Math.round((now - new Date(iso).getTime()) / 86_400_000);
    expect(daysBack(opts.reengagementBefore)).toBe(30);
    expect(daysBack(opts.createdBefore)).toBe(14);
  });

  it('skips a user with recent activity (no email, no stamp)', async () => {
    (fetchParticipationsWithSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: 'p1' }],
    });
    await POST(makeRequest());
    expect(sendMock).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('does not send (or stamp) when the email preference gate denies', async () => {
    (shouldSendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await POST(makeRequest());
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'u1', 'comeback', 'email');
    expect(sendMock).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  /**
   * The preference gate and the unsubscribe link are different things, and
   * this route had the first and not the second. A preference is a setting
   * somebody must know exists; a link is in the message itself.
   */
  it('does not send to somebody who unsubscribed, and does not stamp them', async () => {
    vi.mocked(isEmailSuppressed).mockResolvedValue(true);
    await POST(makeRequest());
    expect(sendMock).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('NO LINK MEANS NO SEND', async () => {
    vi.mocked(unsubUrlFor).mockResolvedValue({ success: true, data: null });
    await POST(makeRequest());
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('what goes out carries a real unsubscribe anchor and the one-click headers', async () => {
    await POST(makeRequest());
    const arg = sendMock.mock.calls[0][0];
    // An <a href>, not the URL appearing anywhere: a broken anchor still
    // contains the string.
    expect(arg.html).toMatch(/<a\s+href="https:\/\/x\/api\/unsubscribe\?token=tok"/);
    expect(arg.headers['List-Unsubscribe']).toBe('<https://x/api/unsubscribe?token=tok>');
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('stamps last_reengagement_sent only on a confirmed send', async () => {
    await POST(makeRequest());
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const [, userId, patch] = (updateUser as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(userId).toBe('u1');
    expect(typeof patch.last_reengagement_sent).toBe('string');
  });

  it('does NOT stamp when the send throws', async () => {
    sendMock.mockRejectedValue(new Error('resend down'));
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.errors).toBe(1);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
