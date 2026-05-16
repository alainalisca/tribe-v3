/**
 * Tests for notifyClientAdded — the welcome-vs-invite dispatcher
 * that fires when a coach adds a client.
 *
 * The decision tree:
 *   1. No client.email → skipped (no_email)
 *   2. Service-role unavailable → skipped (lookup_failed)
 *   3. Email matches a Tribe user → WELCOME (uses recipient's lang)
 *   4. No matching user → INVITE (uses coach's lang)
 *
 * Plus the no-RESEND_API_KEY short-circuit. The actual Resend send
 * call is mocked so we never hit the wire; we only test the dispatch
 * logic — which sender gets called and which language is passed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

vi.mock('./coachAddedYouWelcome', () => ({
  sendCoachAddedYouWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./signUpInvite', () => ({
  sendSignUpInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { notifyClientAdded } from './notifyClientAdded';
import { sendCoachAddedYouWelcome } from './coachAddedYouWelcome';
import { sendSignUpInvite } from './signUpInvite';
import { createClient } from '@supabase/supabase-js';

/**
 * Build a Supabase service-client mock that returns a specific
 * users-row (or null for the no-match path), plus stub gym + coach
 * rows for the body fields.
 */
function mockSupabase(opts: {
  userMatch?: { id: string; preferred_language: string | null } | null;
  gymName?: string;
  coachName?: string;
  coachLang?: string | null;
  userQueryError?: { message: string } | null;
}) {
  const userMaybeSingle = vi.fn().mockResolvedValue({
    data: opts.userMatch ?? null,
    error: opts.userQueryError ?? null,
  });
  const gymMaybeSingle = vi.fn().mockResolvedValue({
    data: opts.gymName ? { name: opts.gymName } : null,
    error: null,
  });
  const coachMaybeSingle = vi.fn().mockResolvedValue({
    data: opts.coachName ? { name: opts.coachName, preferred_language: opts.coachLang ?? null } : null,
    error: null,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === 'users') {
        // Two distinct call patterns:
        //   .from('users').select(...).ilike(email, ...).maybeSingle()  (recipient lookup)
        //   .from('users').select(...).eq('id', ...).maybeSingle()       (coach lookup)
        // Differentiate by which method gets called.
        return {
          select: () => ({
            ilike: () => ({ maybeSingle: userMaybeSingle }),
            eq: () => ({ maybeSingle: coachMaybeSingle }),
          }),
        };
      }
      if (table === 'gyms') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: gymMaybeSingle }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('notifyClientAdded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.RESEND_API_KEY = 'resend-key';
  });

  it('skips when RESEND_API_KEY is missing (silent in production until configured)', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await notifyClientAdded({
      client: { name: 'Anna', email: 'anna@example.com' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });
    expect(result).toEqual({ sent: false, skipped_reason: 'resend_not_configured' });
    expect(sendCoachAddedYouWelcome).not.toHaveBeenCalled();
    expect(sendSignUpInvite).not.toHaveBeenCalled();
  });

  it('skips with no_email when the client has no email on file', async () => {
    const result = await notifyClientAdded({
      client: { name: 'Anna', email: null },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });
    expect(result).toEqual({ sent: false, skipped_reason: 'no_email' });
    expect(sendCoachAddedYouWelcome).not.toHaveBeenCalled();
    expect(sendSignUpInvite).not.toHaveBeenCalled();
  });

  it('sends WELCOME when the email matches a Tribe user (recipient locale)', async () => {
    // anna@example.com IS a Tribe user with preferred_language='es'.
    // Welcome path must use the RECIPIENT's language so the email
    // lands in their preferred locale.
    const supabase = mockSupabase({
      userMatch: { id: 'user-anna', preferred_language: 'es' },
      gymName: 'CrossFit Medellín',
      coachName: 'Coach Alex',
      coachLang: 'en',
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const result = await notifyClientAdded({
      client: { name: 'Anna', email: 'Anna@Example.COM' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });

    expect(result).toEqual({ sent: true, kind: 'welcome' });
    expect(sendCoachAddedYouWelcome).toHaveBeenCalledWith(
      expect.objectContaining({
        memberName: 'Anna',
        // Lowercase + trim the email — matches the user-row lookup.
        memberEmail: 'anna@example.com',
        language: 'es', // recipient's preference wins
        gymName: 'CrossFit Medellín',
        coachName: 'Coach Alex',
      }),
      expect.any(String)
    );
    expect(sendSignUpInvite).not.toHaveBeenCalled();
  });

  it('sends INVITE when the email is unknown to Tribe (coach locale fallback)', async () => {
    // bob@example.com is NOT a Tribe user. Invite path: no recipient
    // language preference exists, so fall back to the coach's
    // locale (the language they're already communicating with the
    // recipient in offline).
    const supabase = mockSupabase({
      userMatch: null,
      gymName: 'CrossFit Medellín',
      coachName: 'Coach Alex',
      coachLang: 'es',
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const result = await notifyClientAdded({
      client: { name: 'Bob', email: 'bob@example.com' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });

    expect(result).toEqual({ sent: true, kind: 'invite' });
    expect(sendSignUpInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        memberName: 'Bob',
        memberEmail: 'bob@example.com',
        language: 'es', // coach's language for invites
        gymName: 'CrossFit Medellín',
        coachName: 'Coach Alex',
      }),
      expect.any(String)
    );
    expect(sendCoachAddedYouWelcome).not.toHaveBeenCalled();
  });

  it('defaults language to en when neither side has a preference', async () => {
    const supabase = mockSupabase({
      userMatch: null,
      gymName: 'Gym',
      coachName: 'Coach',
      coachLang: null,
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const result = await notifyClientAdded({
      client: { name: 'Cam', email: 'cam@example.com' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });

    expect(result.sent).toBe(true);
    expect(sendSignUpInvite).toHaveBeenCalledWith(expect.objectContaining({ language: 'en' }), expect.any(String));
  });

  it('handles a Resend send failure gracefully (returns send_failed, does not throw)', async () => {
    // If Resend errors mid-send, the caller's create flow must not
    // surface a 500 — the client was created successfully, the
    // email is the side-effect. Return send_failed so observability
    // catches it.
    const supabase = mockSupabase({
      userMatch: { id: 'user-1', preferred_language: 'en' },
      gymName: 'Gym',
      coachName: 'Coach',
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);
    vi.mocked(sendCoachAddedYouWelcome).mockRejectedValueOnce(new Error('Resend rate-limited'));

    const result = await notifyClientAdded({
      client: { name: 'Anna', email: 'anna@example.com' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });

    expect(result).toEqual({ sent: false, skipped_reason: 'send_failed' });
  });

  it('handles a missing service-role config gracefully (returns lookup_failed)', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await notifyClientAdded({
      client: { name: 'Anna', email: 'anna@example.com' },
      gymId: 'gym-1',
      actorUserId: 'coach-1',
    });
    // No supabase client could be built; falls through to lookup_failed
    // (we couldn't determine welcome vs invite without the service
    // client). Returns gracefully — does NOT throw.
    expect(result.sent).toBe(false);
    expect(result.skipped_reason).toBe('lookup_failed');
  });
});
