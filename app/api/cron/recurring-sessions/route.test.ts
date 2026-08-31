import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (declared before importing the route) ────────────────────────────
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: () => true }));
vi.mock('@/lib/recurrence', () => ({ computeRecurrenceDates: vi.fn() }));
vi.mock('@/lib/dal/sessions', () => ({
  RECURRING_PARENT_COLUMNS: 'id',
  childSessionExists: vi.fn(async () => ({ success: true, data: false })),
  createChildSession: vi.fn(async () => ({ success: true, data: 'child-id' })),
}));
vi.mock('@/lib/dal/sessionSubscriptions', () => ({
  enrollSubscribersInChildSession: vi.fn(async () => ({ success: true, data: 0 })),
}));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));

import { GET } from './route';
import { computeRecurrenceDates } from '@/lib/recurrence';
import { createChildSession } from '@/lib/dal/sessions';
import { createNotification } from '@/lib/dal/notifications';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { getServiceRoleClient } from '@/lib/supabase/admin';

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';
process.env.CRON_SECRET = 'test-cron-secret';

// Two parents belong to the SAME instructor (inst-1) to prove cross-parent
// accumulation collapses to ONE notification; a third belongs to inst-2.
const PARENTS = [
  { id: 'pa', creator_id: 'inst-1', sport: 'Yoga' },
  { id: 'pb', creator_id: 'inst-1', sport: 'Boxing' },
  { id: 'pc', creator_id: 'inst-2', sport: 'Running' },
];
const USERS = [
  { id: 'inst-1', preferred_language: 'en' },
  { id: 'inst-2', preferred_language: 'es' },
];

/** Thenable chain: every builder method returns itself; awaiting resolves to `result`. */
function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = ret;
  chain.eq = ret;
  chain.is = ret;
  chain.in = ret;
  chain.then = (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return chain;
}

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/recurring-sessions', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  (getServiceRoleClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: (table: string) =>
      chainFor(table === 'sessions' ? { data: PARENTS, error: null } : { data: USERS, error: null }),
  });

  // inst-1: 3 + 2 = 5 new children; inst-2: 1.
  (computeRecurrenceDates as ReturnType<typeof vi.fn>).mockImplementation((parent: { id: string }) =>
    parent.id === 'pa' ? ['d1', 'd2', 'd3'] : parent.id === 'pb' ? ['d1', 'd2'] : ['d1']
  );

  // Push allowed for inst-1 only.
  (shouldSendNotification as ReturnType<typeof vi.fn>).mockImplementation((_c: unknown, userId: string) =>
    Promise.resolve(userId === 'inst-1')
  );

  fetchMock = vi.fn(async () => ({ ok: true }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('recurring-sessions cron — Gate 4 generation notice', () => {
  it('batches one notification per instructor, not one per generated occurrence', async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    // 6 children generated across 3 parents...
    expect(createChildSession).toHaveBeenCalledTimes(6);
    // ...but only 2 notifications (one per distinct instructor).
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(body.childrenCreated).toBe(6);
    expect(body.instructorsNotified).toBe(2);

    const recipients = (createNotification as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].recipient_id);
    expect(recipients.sort()).toEqual(['inst-1', 'inst-2']);

    // inst-1's five occurrences collapse into a single "5" message (EN);
    // inst-2's single occurrence into a "1" message (ES, from preferred_language).
    const byRecipient = Object.fromEntries(
      (createNotification as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1].recipient_id, c[1].message])
    );
    expect(byRecipient['inst-1']).toContain('5 new sessions');
    // inst-2 has a single occurrence, so the ES copy is the SINGULAR form.
    expect(byRecipient['inst-2']).toContain('Se creó 1 nueva sesión');
    expect((createNotification as ReturnType<typeof vi.fn>).mock.calls[0][1].type).toBe('series_occurrences_generated');
  });

  it('renders singular and plural notice copy correctly in both languages', async () => {
    // One instructor per (language x count) combination, so all four bodies are
    // exercised: EN singular, EN plural, ES singular, ES plural.
    const parents = [
      { id: 'pen1', creator_id: 'inst-en-1', sport: 'Yoga' },
      { id: 'pen2', creator_id: 'inst-en-2', sport: 'Boxing' },
      { id: 'pes1', creator_id: 'inst-es-1', sport: 'Running' },
      { id: 'pes2', creator_id: 'inst-es-2', sport: 'Cycling' },
    ];
    const users = [
      { id: 'inst-en-1', preferred_language: 'en' },
      { id: 'inst-en-2', preferred_language: 'en' },
      { id: 'inst-es-1', preferred_language: 'es' },
      { id: 'inst-es-2', preferred_language: 'es' },
    ];
    (getServiceRoleClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: (table: string) =>
        chainFor(table === 'sessions' ? { data: parents, error: null } : { data: users, error: null }),
    });
    // The *2 parents get two occurrences (plural); the *1 parents get one (singular).
    (computeRecurrenceDates as ReturnType<typeof vi.fn>).mockImplementation((parent: { id: string }) =>
      parent.id === 'pen2' || parent.id === 'pes2' ? ['d1', 'd2'] : ['d1']
    );
    // Push off: the in-app bell (createNotification) is created regardless, and
    // that is the copy under test.
    (shouldSendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await GET(makeRequest());

    const byRecipient = Object.fromEntries(
      (createNotification as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1].recipient_id, c[1].message])
    );
    expect(byRecipient['inst-en-1']).toContain('1 new session from your recurring series');
    expect(byRecipient['inst-en-2']).toContain('2 new sessions from your recurring series');
    expect(byRecipient['inst-es-1']).toContain('Se creó 1 nueva sesión');
    expect(byRecipient['inst-es-2']).toContain('Se crearon 2 nuevas sesiones');
  });

  it('gates push on shouldSendNotification and never bypasses it', async () => {
    await GET(makeRequest());

    // Preference checked once per instructor.
    expect(shouldSendNotification).toHaveBeenCalledTimes(2);
    expect(shouldSendNotification).toHaveBeenCalledWith(
      expect.anything(),
      'inst-1',
      'series_occurrences_generated',
      'push'
    );

    // Push fetch fired ONCE (inst-1 allowed); inst-2 denied -> no push, but the
    // in-app record was still created for both (asserted above).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.tribe.app/api/notifications/send/');
    const sent = JSON.parse((opts as { body: string }).body);
    expect(sent.userId).toBe('inst-1');
    expect(sent.url).toBe('/dashboard/instructor/');
  });
});
