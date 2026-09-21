/**
 * A session invite must be tappable, and must land on the INVITE, not the
 * session.
 *
 * /api/invites/session minted an invite token, stored it, and never delivered
 * it: notifications.entity_id is uuid and cannot hold 32 hex characters, and
 * nothing else on a notification could carry it. So the recipient got a
 * message pointing at the session, and an invite_only session refuses a
 * tokenless join -- the exact dead end the mint was meant to prevent.
 *
 * `session_invite` was also absent from getNotificationLink's type list
 * entirely, so it returned null and the notification was not even tappable.
 *
 * Migration 182 added action_url. These tests exist so the column cannot be
 * written and then ignored, which would be the same bug one level up.
 */
import { describe, it, expect } from 'vitest';
import { getNotificationLink } from './page';

type Notif = Parameters<typeof getNotificationLink>[0];
const notif = (o: Record<string, unknown>) => o as unknown as Notif;

describe('getNotificationLink honours action_url', () => {
  it('sends a session invite to the invite token, not the session', () => {
    expect(
      getNotificationLink(
        notif({
          type: 'session_invite',
          entity_type: 'session',
          entity_id: 'sess-1',
          actor_id: 'alice',
          action_url: '/invite/deadbeefdeadbeefdeadbeefdeadbeef/',
        })
      )
    ).toBe('/invite/deadbeefdeadbeefdeadbeefdeadbeef/');
  });

  /** Checked FIRST, so a type-based rule cannot quietly outrank the
   *  destination the sender actually chose. */
  it('an explicit action_url outranks the inferred session link', () => {
    expect(
      getNotificationLink(
        notif({
          type: 'session_join',
          entity_type: 'session',
          entity_id: 'sess-1',
          actor_id: 'bob',
          action_url: '/invite/abc123/',
        })
      )
    ).toBe('/invite/abc123/');
  });

  /** The presence arm. Without it, "action_url wins" would also pass against a
   *  function that returned action_url and nothing else, breaking every
   *  notification that has none. */
  it('falls back to the existing rules when action_url is absent', () => {
    expect(
      getNotificationLink(notif({ type: 'session_join', entity_type: 'session', entity_id: 'sess-1', actor_id: 'bob' }))
    ).toBe('/session/sess-1');
    expect(getNotificationLink(notif({ type: 'follow', actor_id: 'carol' }))).toBe('/profile/carol');
  });

  it('an empty action_url does not override, and does not produce an empty link', () => {
    expect(
      getNotificationLink(
        notif({
          type: 'session_join',
          entity_type: 'session',
          entity_id: 'sess-1',
          actor_id: 'bob',
          action_url: '',
        })
      )
    ).toBe('/session/sess-1');
  });
});
