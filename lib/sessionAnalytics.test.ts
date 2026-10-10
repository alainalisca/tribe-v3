/**
 * T-ANALYTICS1 part D: session_joined (with is_first_join) and session_left.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const trackEvent = vi.fn();
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
const fetchParticipantCountForUser = vi.fn();
vi.mock('@/lib/dal/participants', () => ({
  fetchParticipantCountForUser: (...a: unknown[]) => fetchParticipantCountForUser(...a),
}));

import { trackSessionJoined, trackSessionJoinRequested, trackSessionLeft } from './sessionAnalytics';

const supabase = {} as SupabaseClient;
const session = { id: 's1', sport: 'running', is_paid: false, creator_id: 'coach-1' };

beforeEach(() => vi.clearAllMocks());

describe('trackSessionJoined', () => {
  it('sends the spec properties: session, sport, paid, instructor, first join', async () => {
    fetchParticipantCountForUser.mockResolvedValue({ success: true, data: 1 });
    await trackSessionJoined(supabase, session, 'u1');
    expect(fetchParticipantCountForUser).toHaveBeenCalledWith(supabase, 'u1');
    expect(trackEvent).toHaveBeenCalledWith('session_joined', {
      session_id: 's1',
      sport: 'running',
      is_paid: false,
      instructor_id: 'coach-1',
      is_first_join: true,
      session_type: 'free',
    });
  });

  it('a second confirmed join is not a first join', async () => {
    fetchParticipantCountForUser.mockResolvedValue({ success: true, data: 2 });
    await trackSessionJoined(supabase, { ...session, is_paid: true }, 'u1');
    expect(trackEvent.mock.calls[0][1]).toMatchObject({ is_first_join: false, is_paid: true, session_type: 'paid' });
  });

  it('reports null, not a guess, when the count cannot be read', async () => {
    fetchParticipantCountForUser.mockResolvedValue({ success: false, error: 'rls' });
    await trackSessionJoined(supabase, session, 'u1');
    expect(trackEvent.mock.calls[0][1].is_first_join).toBeNull();
  });
});

describe('trackSessionLeft', () => {
  it('sends session_left with the session id only', () => {
    trackSessionLeft('s1');
    expect(trackEvent).toHaveBeenCalledWith('session_left', { session_id: 's1' });
  });
});

describe('trackSessionJoinRequested', () => {
  it('a curated free session is a curated request', () => {
    trackSessionJoinRequested({ ...session, price_cents: null });
    expect(trackEvent).toHaveBeenCalledWith('session_join_requested', {
      session_id: 's1',
      sport: 'running',
      is_paid: false,
      instructor_id: 'coach-1',
      reason: 'curated',
    });
  });

  it('a paid session is a paid request, the same rule joinSession uses', () => {
    trackSessionJoinRequested({ ...session, is_paid: true, price_cents: 25000 });
    expect(trackEvent.mock.calls[0][1]).toMatchObject({ is_paid: true, reason: 'paid' });
  });
});
