/**
 * The partner-application bell had no case in getNotificationLink, so tapping
 * it did nothing: the only admin who can act on the queue could not reach it
 * from the notification telling them to.
 */
import { describe, it, expect } from 'vitest';
import { getNotificationLink } from './page';

const base = { entity_type: 'featured_partner', entity_id: 'fp-1', actor_id: 'gym-owner' };

describe('getNotificationLink for partner notifications', () => {
  it('sends the admin to the partner queue for a new application', () => {
    expect(getNotificationLink({ ...base, type: 'partner_application' } as never)).toBe('/admin/partners/');
  });

  it('sends the admin to the partner queue for a self-activation', () => {
    expect(getNotificationLink({ ...base, type: 'partner_activated' } as never)).toBe('/admin/partners/');
  });

  it('still resolves without an entity_id, since the queue is not per-partner', () => {
    expect(getNotificationLink({ ...base, entity_id: null, type: 'partner_application' } as never)).toBe(
      '/admin/partners/'
    );
  });

  it('keeps the trailing slash, since a 308 strips auth headers', () => {
    const href = getNotificationLink({ ...base, type: 'partner_application' } as never);
    expect(href?.endsWith('/')).toBe(true);
  });
});
