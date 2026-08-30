import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldSendNotification, filterPushRecipients, DEFAULT_PREFERENCES } from './notificationPreferences';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// Representative types from TYPE_META (real map, not mocked):
//   'new_message'  -> messages,          push default_on, email default_on
//   'weekly_recap' -> weekly_recap,      push default_on, email opt_in
//   'nearby'       -> proximity_alerts,  push default_on, email opt_in
//   'tip_received' -> null,              push default_on, email required
//   'welcome'      -> null,              push required,    email required
//   'totally_unknown' -> unmapped (treated as default_on, no category)
//
// Note on push opt_in: no production type uses push:opt_in because on push it is
// behaviorally identical to default_on (push_enabled is the only channel master
// on push; email_enabled never applies). The default_on push tests exercise that
// same code path.
const DEFAULT_ON = 'new_message';
const OPT_IN_EMAIL = 'weekly_recap';
const REQUIRED_EMAIL = 'tip_received';
const REQUIRED_PUSH = 'welcome';
const UNMAPPED = 'totally_unknown';

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

describe('shouldSendNotification (per-channel delivery policy)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('in_app is always allowed', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: false, email_enabled: false, messages: false })));
    expect(await shouldSendNotification(s, 'u1', DEFAULT_ON, 'in_app')).toBe(true);
    expect(await shouldSendNotification(s, 'u1', OPT_IN_EMAIL, 'in_app')).toBe(true);
  });

  // required: always sends, nothing suppresses, on either channel.
  it('required email sends even with email_enabled off', async () => {
    const s = makeSupabase(ok(prefs({ email_enabled: false })));
    expect(await shouldSendNotification(s, 'u1', REQUIRED_EMAIL, 'email')).toBe(true);
  });
  it('required push sends even with push_enabled off', async () => {
    const s = makeSupabase(ok(prefs({ push_enabled: false })));
    expect(await shouldSendNotification(s, 'u1', REQUIRED_PUSH, 'push')).toBe(true);
  });

  // default_on email: ignore email_enabled, require the category.
  it('default_on email ignores email_enabled but honors the category', async () => {
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ email_enabled: false, messages: true }))),
        'u1',
        DEFAULT_ON,
        'email'
      )
    ).toBe(true);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ email_enabled: true, messages: false }))),
        'u1',
        DEFAULT_ON,
        'email'
      )
    ).toBe(false);
    expect(await shouldSendNotification(makeSupabase(ok(prefs({ messages: true }))), 'u1', DEFAULT_ON, 'email')).toBe(
      true
    );
  });

  // default_on push: require push_enabled AND the category.
  it('default_on push requires push_enabled and the category', async () => {
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: true, messages: true }))),
        'u1',
        DEFAULT_ON,
        'push'
      )
    ).toBe(true);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: false, messages: true }))),
        'u1',
        DEFAULT_ON,
        'push'
      )
    ).toBe(false);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: true, messages: false }))),
        'u1',
        DEFAULT_ON,
        'push'
      )
    ).toBe(false);
  });

  // opt_in email: require email_enabled AND the category.
  it('opt_in email requires email_enabled and the category', async () => {
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ email_enabled: false, weekly_recap: true }))),
        'u1',
        OPT_IN_EMAIL,
        'email'
      )
    ).toBe(false);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ email_enabled: true, weekly_recap: false }))),
        'u1',
        OPT_IN_EMAIL,
        'email'
      )
    ).toBe(false);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ email_enabled: true, weekly_recap: true }))),
        'u1',
        OPT_IN_EMAIL,
        'email'
      )
    ).toBe(true);
  });

  // opt_in push == default_on push behaviorally (push_enabled + category). Uses
  // 'weekly_recap' whose push policy is default_on; the code path is the same.
  it('opt_in/default_on push both require push_enabled and the category', async () => {
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: true, weekly_recap: true }))),
        'u1',
        OPT_IN_EMAIL,
        'push'
      )
    ).toBe(true);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: false, weekly_recap: true }))),
        'u1',
        OPT_IN_EMAIL,
        'push'
      )
    ).toBe(false);
    expect(
      await shouldSendNotification(
        makeSupabase(ok(prefs({ push_enabled: true, weekly_recap: false }))),
        'u1',
        OPT_IN_EMAIL,
        'push'
      )
    ).toBe(false);
  });

  // Unmapped type: default_on with no category. Push respects push_enabled;
  // email ignores email_enabled (fail-open).
  it('unmapped push respects push_enabled', async () => {
    expect(await shouldSendNotification(makeSupabase(ok(prefs({ push_enabled: true }))), 'u1', UNMAPPED, 'push')).toBe(
      true
    );
    expect(await shouldSendNotification(makeSupabase(ok(prefs({ push_enabled: false }))), 'u1', UNMAPPED, 'push')).toBe(
      false
    );
  });
  it('unmapped email is fail-open (always allowed)', async () => {
    expect(
      await shouldSendNotification(makeSupabase(ok(prefs({ email_enabled: false }))), 'u1', UNMAPPED, 'email')
    ).toBe(true);
    expect(
      await shouldSendNotification(makeSupabase(ok(prefs({ email_enabled: true }))), 'u1', UNMAPPED, 'email')
    ).toBe(true);
  });

  // No preferences row: DEFAULT_PREFERENCES apply (push on, email off, categories default).
  it('no preferences row falls back to defaults', async () => {
    const none = makeSupabase(ok(null));
    expect(await shouldSendNotification(none, 'u1', REQUIRED_EMAIL, 'email')).toBe(true); // required
    expect(await shouldSendNotification(none, 'u1', DEFAULT_ON, 'email')).toBe(true); // default_on ignores email off, messages default on
    expect(await shouldSendNotification(none, 'u1', OPT_IN_EMAIL, 'email')).toBe(false); // opt_in, email default off
    expect(await shouldSendNotification(none, 'u1', DEFAULT_ON, 'push')).toBe(true); // push default on, messages default on
  });

  // DB error: fail open (unchanged).
  it('fails open on a DB error', async () => {
    const s = makeSupabase(dbErr);
    expect(await shouldSendNotification(s, 'u1', OPT_IN_EMAIL, 'email')).toBe(true);
    expect(await shouldSendNotification(s, 'u1', DEFAULT_ON, 'push')).toBe(true);
  });
});

describe('filterPushRecipients (matches the single push path)', () => {
  beforeEach(() => vi.clearAllMocks());

  // required push: everyone allowed, push_enabled ignored.
  it('required keeps every recipient regardless of push_enabled', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: false },
        { user_id: 'b', push_enabled: true },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b'], REQUIRED_PUSH);
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  // default_on push with a category: require push_enabled AND the category.
  it('default_on push requires push_enabled and the category flag', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: true, messages: true },
        { user_id: 'b', push_enabled: true, messages: false },
        { user_id: 'c', push_enabled: false, messages: true },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b', 'c'], DEFAULT_ON);
    expect([...out].sort()).toEqual(['a']);
  });

  // Receipt with null category (tip_received): push_enabled alone decides.
  it('a null-category type gates on push_enabled only', async () => {
    const s = makeSupabase(
      ok([
        { user_id: 'a', push_enabled: true },
        { user_id: 'b', push_enabled: false },
      ])
    );
    const out = await filterPushRecipients(s, ['a', 'b'], REQUIRED_EMAIL); // tip_received: push default_on, category null
    expect([...out].sort()).toEqual(['a']);
  });

  // Unmapped type: push_enabled only.
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
    // 'a' has a row with the category off -> dropped. 'b' has no row -> defaults
    // (push on, messages on) -> allowed.
    const s = makeSupabase(ok([{ user_id: 'a', push_enabled: true, messages: false }]));
    const out = await filterPushRecipients(s, ['a', 'b'], DEFAULT_ON);
    expect([...out].sort()).toEqual(['b']);
  });

  // DB error: fail open, everyone allowed.
  it('fails open on a DB error', async () => {
    const s = makeSupabase(dbErr);
    const out = await filterPushRecipients(s, ['a', 'b'], DEFAULT_ON);
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty set for no recipients', async () => {
    const s = makeSupabase(ok([]));
    const out = await filterPushRecipients(s, [], DEFAULT_ON);
    expect(out.size).toBe(0);
  });
});
