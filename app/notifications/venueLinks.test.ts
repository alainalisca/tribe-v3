/**
 * Venue notifications must go somewhere (T-GYM2, DoD 6).
 *
 * They shipped with no case in getNotificationLink, so both bells were dead
 * ends: the gym's could not reach its queue and the instructor's could not
 * reach the session the verdict was about.
 */
import { describe, it, expect } from 'vitest';
import { getNotificationLink } from './page';

const base = { entity_type: 'session', entity_id: 'sess-1', actor_id: 'leo' };

describe('getNotificationLink for venue notifications', () => {
  it('sends the gym to its approval queue', () => {
    expect(getNotificationLink({ ...base, type: 'venue_request_new' } as never)).toBe('/dashboard/partner/');
  });

  it('sends the instructor to the session that was approved', () => {
    expect(getNotificationLink({ ...base, type: 'venue_request_approved' } as never)).toBe('/session/sess-1');
  });

  it('sends the instructor to the session that was declined', () => {
    expect(getNotificationLink({ ...base, type: 'venue_request_declined' } as never)).toBe('/session/sess-1');
  });

  it('returns null for a verdict with no session attached, rather than /session/undefined', () => {
    expect(getNotificationLink({ ...base, entity_id: null, type: 'venue_request_approved' } as never)).toBeNull();
  });

  it('keeps the trailing slash on the dashboard, since a 308 strips auth headers', () => {
    const href = getNotificationLink({ ...base, type: 'venue_request_new' } as never);
    expect(href?.endsWith('/')).toBe(true);
  });
});
