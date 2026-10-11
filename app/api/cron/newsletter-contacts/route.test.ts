import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runContactSync = vi.fn();
const getResendContactsClient = vi.fn(() => ({ contacts: {} }));
const log = vi.fn();
const logError = vi.fn();

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/lib/newsletter/contactSync', () => ({ runContactSync: (...a: unknown[]) => runContactSync(...a) }));
vi.mock('@/lib/email/resendClient', () => ({ getResendContactsClient: () => getResendContactsClient() }));
vi.mock('@/lib/logger', () => ({ log: (...a: unknown[]) => log(...a), logError: (...a: unknown[]) => logError(...a) }));

import { GET } from './route';

const SECRET = 'test-cron-secret';
const req = (auth?: string) =>
  new Request('https://tribelatam.com/api/cron/newsletter-contacts/', auth ? { headers: { authorization: auth } } : {});

const summary = {
  appMembers: 80,
  resendContacts: 80,
  pulled: 0,
  pushed: 0,
  removed: 0,
  created: 0,
  failed: 0,
  deferred: 0,
  refused: null,
  rateLimited: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/newsletter-contacts', () => {
  it('rejects a request with no authorization, and touches nothing', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runContactSync).not.toHaveBeenCalled();
    expect(getResendContactsClient).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret', async () => {
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(runContactSync).not.toHaveBeenCalled();
  });

  it('runs the sync with the right secret and returns its summary', async () => {
    runContactSync.mockResolvedValue({ ...summary, created: 2 });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, created: 2 });
  });

  it('a refused plan is a 200 logged at warn, not a crash', async () => {
    runContactSync.mockResolvedValue({ ...summary, refused: 'would remove 80 of 80 contacts (limit 20%)' });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      'warn',
      'newsletter_contacts_refused',
      expect.objectContaining({ refused: expect.stringContaining('80 of 80') })
    );
  });

  it('a thrown sync is a 500 with the error logged, and no detail leaked', async () => {
    runContactSync.mockRejectedValue(new Error('contacts.list: invalid_api_key'));
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('invalid_api_key');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('invalid_api_key') }),
      expect.objectContaining({ action: 'cron_failed' })
    );
  });
});
