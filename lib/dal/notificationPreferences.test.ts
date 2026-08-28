import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSendNotification, filterPushRecipients, DEFAULT_PREFERENCES } from './notificationPreferences';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// Representative types from TYPE_META (real map, not mocked):
//   'new_message'    -> messages,          transactional
//   'weekly_recap'   -> weekly_recap,      marketing
//   'nearby'         -> proximity_alerts,  marketing
//   'totally_unknown'-> unmapped
const TRANSACTIONAL = 'new_message';
const MARKETING_EMAIL = 'weekly_recap';
const MARKETING_PUSH = 'nearby';
const UNMAPPED = 'totally_unknown';

/** Full prefs row with overridable flags. */
function prefs(over: Record<string, boolean> = {}) {
  return { user_id: 'u1', ...DEFAULT_PREFERENCES, ...over };
}

/**
 * Chainable Supabase stub covering both query shapes this module uses:
 * getNotificationPreferences (`.select().eq().maybeSingle()`) and
 * filterPushRecipients (`.select().in()`). Both resolve the same `result`.
 */
function makeSupabase(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub stands in for SupabaseClient
  return { from: () => builder } as any;
}

const ok = (data: unknown) => ({ data, error: null });
const dbErr = { data: null, error: { message: 'permission denied' } };

describe('shouldSendNotification (class-aware)', () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. in_app: always true, class irrelevant, even with everything off.
  it('in_app is always allowed', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: false, email_enabled: false, messages: false })));
    expect(await shouldSendNotification(s, 'u1', TRANSACTIONAL, 'in_app')).toBe(true);
    expect(await shouldSendNotification(s, 'u1', MARKETING_EMAIL, 'in_app')).toBe(true);
  });

  // 2. email + transactional: ignore email_enabled AND category.
  it('transactional email sends even with email_enabled off and category off', async () => {
    const s = makeSupabase(ok(prefs({ email_enabled: false, messages: false })));
    expect(await shouldSendNotification(s, 'u1', TRANSACTIONAL, 'email')).toBe(true);
  });

  // 3. email + marketing: require email_enabled AND the category flag.
  it('marketing email is blocked when email_enabled is off', async () => {
    const s = makeSupabase(ok(prefs({ email_enabled: false, weekly_recap: true })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_EMAIL, 'email')).toBe(false);
  });
  it('marketing email is blocked when the category is off (even with email_enabled on)', async () => {
    const s = makeSupabase(ok(prefs({ email_enabled: true, weekly_recap: false })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_EMAIL, 'email')).toBe(false);
  });
  it('marketing email sends when email_enabled and the category are both on', async () => {
    const s = makeSupabase(ok(prefs({ email_enabled: true, weekly_recap: true })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_EMAIL, 'email')).toBe(true);
  });

  // 4. push + transactional: require push_enabled, bypass the category.
  it('transactional push sends with push_enabled on even when the category is off', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: true, messages: false })));
    expect(await shouldSendNotification(s, 'u1', TRANSACTIONAL, 'push')).toBe(true);
  });
  it('transactional push is blocked when push_enabled is off', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: false, messages: true })));
    expect(await shouldSendNotification(s, 'u1', TRANSACTIONAL, 'push')).toBe(false);
  });

  // 5. push + marketing: require push_enabled AND the category flag.
  it('marketing push sends when push_enabled and the category are both on', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: true, proximity_alerts: true })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_PUSH, 'push')).toBe(true);
  });
  it('marketing push is blocked when the category is off', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: true, proximity_alerts: false })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_PUSH, 'push')).toBe(false);
  });
  it('marketing push is blocked when push_enabled is off', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: false, proximity_alerts: true })));
    expect(await shouldSendNotification(s, 'u1', MARKETING_PUSH, 'push')).toBe(false);
  });

  // Unmapped type: respects the master toggle, no category requirement.
  it('unmapped type respects the master toggle (push on -> allowed, off -> blocked)', async () => {
    expect(await shouldSendNotification(makeSupabase(ok(prefs({ push_enabled: true }))), 'u1', UNMAPPED, 'push')).toBe(
      true
    );
    expect(await shouldSendNotification(makeSupabase(ok(prefs({ push_enabled: false }))), 'u1', UNMAPPED, 'push')).toBe(
      false
    );
    expect(
      await shouldSendNotification(makeSupabase(ok(prefs({ email_enabled: true }))), 'u1', UNMAPPED, 'email')
    ).toBe(true);
    expect(
      await shouldSendNotification(makeSupabase(ok(prefs({ email_enabled: false }))), 'u1', UNMAPPED, 'email')
    ).toBe(false);
  });

  // No preferences row: DEFAULT_PREFERENCES apply (push on, email off, categories default).
  it('no preferences row falls back to defaults', async () => {
    const none = makeSupabase(ok(null));
    // transactional email bypasses email_enabled -> true even though default email is off
    expect(await shouldSendNotification(none, 'u1', TRANSACTIONAL, 'email')).toBe(true);
    // marketing email: default email_enabled false -> blocked
    expect(await shouldSendNotification(none, 'u1', MARKETING_EMAIL, 'email')).toBe(false);
    // marketing push: default push_enabled true + proximity_alerts default true -> allowed
    expect(await shouldSendNotification(none, 'u1', MARKETING_PUSH, 'push')).toBe(true);
    // transactional push: default push_enabled true -> allowed
    expect(await shouldSendNotification(none, 'u1', TRANSACTIONAL, 'push')).toBe(true);
  });

  // DB error: fail open (unchanged), regardless of class/channel.
  it('fails open on a DB error', async () => {
    const s = makeSupabase(dbErr);
    expect(await shouldSendNotification(s, 'u1', MARKETING_EMAIL, 'email')).toBe(true);
    expect(await shouldSendNotification(s, 'u1', MARKETING_PUSH, 'push')).toBe(true);
  });
});

describe('filterPushRecipients (class-aware, matches the single push path)', () => {
  beforeEach(() => vi.clearAllMocks());

  // push + transactional: bypass category, push master alone decides.
  it('transactional keeps push-enabled users regardless of category', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: true, messages: false },
        { user_id: 'b', push_enabled: false, messages: true },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b'], TRANSACTIONAL);
    expect([...out].sort()).toEqual(['a']);
  });

  // push + marketing: require push_enabled AND category.
  it('marketing requires push_enabled and the category flag', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: true, proximity_alerts: true },
        { user_id: 'b', push_enabled: true, proximity_alerts: false },
        { user_id: 'c', push_enabled: false, proximity_alerts: true },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b', 'c'], MARKETING_PUSH);
    expect([...out].sort()).toEqual(['a']);
  });

  // Unmapped type: respects push_enabled, no category requirement (parity with
  // the single path; no longer the old blanket allow-all).
  it('unmapped type respects push_enabled only', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: true },
        { user_id: 'b', push_enabled: false },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b'], UNMAPPED);
    expect([...out].sort()).toEqual(['a']);
  });

  // No row for a user: DEFAULT_PREFERENCES apply.
  it('a user with no row falls back to defaults', async () => {
    // Only 'a' has a row (category off). 'b' is missing -> defaults (push on,
    // proximity_alerts on) -> allowed.
    const s = makeSupabase(ok([{ user_id: 'a', push_enabled: true, proximity_alerts: false }]));
    const out = await filterPushRecipients(s, ['a', 'b'], MARKETING_PUSH);
    expect([...out].sort()).toEqual(['b']);
  });

  // DB error: fail open, everyone allowed.
  it('fails open on a DB error', async () => {
    const s = makeSupabase(dbErr);
    const out = await filterPushRecipients(s, ['a', 'b'], MARKETING_PUSH);
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty set for no recipients', async () => {
    const s = makeSupabase(ok([]));
    const out = await filterPushRecipients(s, [], MARKETING_PUSH);
    expect(out.size).toBe(0);
  });
});
