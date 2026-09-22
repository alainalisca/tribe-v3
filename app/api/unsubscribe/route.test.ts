/**
 * The unsubscribe link. It is the only way anyone has ever had to stop
 * receiving email from this app, so the case that matters most is the one
 * where it does NOT work and says it did.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/dal/emailUnsubscribe', () => ({
  userForUnsubToken: vi.fn(),
  setEmailUnsubscribed: vi.fn(),
}));

import { GET, POST } from './route';
import { userForUnsubToken, setEmailUnsubscribed } from '@/lib/dal/emailUnsubscribe';

const call = (qs: string) => GET(new Request(`https://x/api/unsubscribe${qs}`));
const DONE = /no recibirás más correos|not receive any more/i;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userForUnsubToken).mockResolvedValue({ success: true, data: 'u1' });
  vi.mocked(setEmailUnsubscribed).mockResolvedValue({ success: true, data: null });
});

describe('unsubscribe', () => {
  it('NON-VACUITY: a good token reaches the write and confirms', async () => {
    const res = await call('?token=abc');
    expect(res.status).toBe(200);
    expect(setEmailUnsubscribed).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(await res.text()).toMatch(DONE);
  });

  it('is idempotent, so a scanner prefetch is harmless', async () => {
    // This is the same email-scanner prefetch that consumed single-use auth
    // tokens and produced "link invalid or expired". Here the token is not
    // consumed and the write has no second effect, so a second GET is fine.
    await call('?token=abc');
    const second = await call('?token=abc');
    expect(second.status).toBe(200);
    expect(await second.text()).toMatch(DONE);
  });

  it('POST works too, for RFC 8058 one-click', async () => {
    const res = await POST(new Request('https://x/api/unsubscribe?token=abc', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(setEmailUnsubscribed).toHaveBeenCalled();
  });

  it('no token writes nothing', async () => {
    const res = await call('');
    expect(res.status).toBe(400);
    expect(setEmailUnsubscribed).not.toHaveBeenCalled();
  });

  it('an unknown token writes nothing', async () => {
    vi.mocked(userForUnsubToken).mockResolvedValue({ success: true, data: null });
    const res = await call('?token=nope');
    expect(res.status).toBe(404);
    expect(setEmailUnsubscribed).not.toHaveBeenCalled();
  });

  /** THE CASE THAT MATTERS. A failed lookup must not read as success: the
   *  person walks away believing they are off the list and the next campaign
   *  mails them again. */
  it('a FAILED LOOKUP says so rather than claiming success', async () => {
    vi.mocked(userForUnsubToken).mockResolvedValue({ success: false, error: 'db down' });
    const res = await call('?token=abc');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(DONE);
    expect(setEmailUnsubscribed).not.toHaveBeenCalled();
  });

  it('a FAILED WRITE says so rather than claiming success', async () => {
    vi.mocked(setEmailUnsubscribed).mockResolvedValue({ success: false, error: 'db down' });
    const res = await call('?token=abc');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(DONE);
  });
});
