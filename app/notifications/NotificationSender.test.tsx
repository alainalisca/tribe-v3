/**
 * S3 UI half: a notification from a person must never wear the system icon.
 *
 * Migration 195 stopped a signed-in user forging `actor_id`. It could not stop
 * a bell from LOOKING system-sent, because nothing about the row was wrong --
 * the page simply rendered `actor?.avatar_url ? <img> : TYPE_ICONS[type]`, so
 * any user without a profile photo got the official icon beside a message they
 * chose.
 *
 * The mutation that must fail these tests is restoring exactly that
 * expression. It is driven from scripts/s3-ui-mutation-proof.py, which
 * asserts the mutation LANDED in the file before it interprets the result --
 * CLAUDE.md has two worked cases of a mutation proof that silently never
 * mutated and reported success either way.
 *
 * FIXTURES ARE TYPED, NEVER CAST. `as never` / `as unknown as X` on a fixture
 * turns off the only check that knows whether the shape matches what the
 * component reads, and this repo has two live defects from exactly that.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotificationSender, { hasHumanSender, senderName, type SenderFields } from './NotificationSender';

function notif(over: Partial<SenderFields>): SenderFields {
  return { actor_id: null, type: 'general', actor: null, ...over };
}

const ACTOR = '00000000-0000-4000-8000-000000000001';

describe('NotificationSender', () => {
  describe('an actor WITHOUT an avatar -- the defect', () => {
    const n = notif({
      actor_id: ACTOR,
      type: 'achievement', // the most official-looking type in the map
      actor: { id: ACTOR, name: 'Ana Prueba', avatar_url: null },
    });

    it('renders initials, NOT the system type icon', () => {
      render(<NotificationSender notification={n} unknownSenderLabel="Someone" />);
      expect(screen.getByTestId('notification-actor-initials')).toBeTruthy();
      // The assertion that actually pins the defect: the official icon is absent.
      expect(screen.queryByTestId('notification-type-icon')).toBeNull();
    });

    it('shows the sender name, so the bell is attributable', () => {
      expect(senderName(n, 'Someone')).toBe('Ana Prueba');
    });

    it('derives the initials from the name', () => {
      render(<NotificationSender notification={n} unknownSenderLabel="Someone" />);
      expect(screen.getByTestId('notification-actor-initials').textContent).toBe('AP');
    });
  });

  describe('an actor WITH an avatar', () => {
    it('renders the photo and no type icon', () => {
      const n = notif({
        actor_id: ACTOR,
        type: 'achievement',
        actor: { id: ACTOR, name: 'Ana Prueba', avatar_url: 'https://cdn.example/a.jpg' },
      });
      render(<NotificationSender notification={n} unknownSenderLabel="Someone" />);
      expect(screen.getByTestId('notification-actor-avatar')).toBeTruthy();
      expect(screen.queryByTestId('notification-type-icon')).toBeNull();
    });
  });

  describe('NO actor -- system and self notifications', () => {
    it('renders the type icon, which is the ONLY place it belongs', () => {
      const n = notif({ actor_id: null, type: 'achievement', actor: null });
      render(<NotificationSender notification={n} unknownSenderLabel="Someone" />);
      expect(screen.getByTestId('notification-type-icon')).toBeTruthy();
      expect(screen.queryByTestId('notification-actor-initials')).toBeNull();
      expect(screen.queryByTestId('notification-actor-avatar')).toBeNull();
    });

    it('has no sender line', () => {
      expect(senderName(notif({ actor_id: null }), 'Someone')).toBeNull();
    });
  });

  describe('actor_id set but the profile did not join', () => {
    // The LEFT JOIN is independently nullable: soft-deleted, banned, or simply
    // unreadable under the column grants on public.users. Keying the branch on
    // `actor` instead of `actor_id` would send all of those back to the type
    // icon -- reopening the gap for the accounts most likely to be abusive.
    const n = notif({ actor_id: ACTOR, type: 'achievement', actor: null });

    it('still renders a person, not the system icon', () => {
      render(<NotificationSender notification={n} unknownSenderLabel="Someone" />);
      expect(screen.getByTestId('notification-actor-initials')).toBeTruthy();
      expect(screen.queryByTestId('notification-type-icon')).toBeNull();
    });

    it('falls back to the label the caller resolved', () => {
      expect(senderName(n, 'Someone')).toBe('Someone');
    });

    // The bilingual guarantee moved to the message files when senderName
    // stopped taking a language. Asserting it HERE would only prove that a
    // parameter comes back out, so assert it where the copy actually lives.
    it('has the fallback copy in both message files', async () => {
      // No cast. The JSON modules are already typed, and a cast here would
      // switch off the one check that knows these keys exist -- which is how
      // this repo has twice shipped a fixture describing a shape nothing has.
      const en = (await import('@/messages/en.json')).default;
      const es = (await import('@/messages/es.json')).default;
      expect(en.notif.unknownSender).toBe('Someone');
      expect(es.notif.unknownSender).toBe('Alguien');
      expect(es.notif.unknownSender).not.toBe(en.notif.unknownSender);
    });

    it('renders ? for the initials rather than crashing', () => {
      render(<NotificationSender notification={n} unknownSenderLabel="Alguien" />);
      expect(screen.getByTestId('notification-actor-initials').textContent).toBe('A'); // "Alguien"
    });
  });

  describe('hasHumanSender', () => {
    it('is a fact about actor_id, not about the joined actor', () => {
      expect(hasHumanSender({ actor_id: ACTOR })).toBe(true);
      expect(hasHumanSender({ actor_id: null })).toBe(false);
    });
  });
});
