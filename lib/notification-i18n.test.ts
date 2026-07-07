import { describe, it, expect } from 'vitest';
import { notificationCopy, toLang } from './notification-i18n';

/**
 * BUG-222: verify that the notification template helper returns the correct
 * language copy for each supported locale, and that the fallback to 'en'
 * works for unknown/null values.
 */

describe('notificationCopy', () => {
  describe('join template', () => {
    it('returns English copy for en recipient', () => {
      const { title, body } = notificationCopy('join', 'en', { name: 'Ana', sport: 'Running' });
      expect(title).toBe('🎉 New Training Partner!');
      expect(body).toBe('Ana joined your Running session');
    });

    it('returns Spanish copy for es recipient', () => {
      const { title, body } = notificationCopy('join', 'es', { name: 'Ana', sport: 'Running' });
      expect(title).toBe('🎉 ¡Nuevo compañero de entrenamiento!');
      expect(body).toContain('Ana');
      expect(body).toContain('Running');
      // ES body should NOT contain "joined" (English verb)
      expect(body).not.toContain('joined');
    });
  });

  describe('join_request template', () => {
    it('returns English copy for en', () => {
      const { title, body } = notificationCopy('join_request', 'en', { name: 'Carlos', sport: 'Cycling' });
      expect(title).toBe('📩 New Join Request');
      expect(body).toContain('Carlos');
      expect(body).toContain('Cycling');
    });

    it('returns Spanish copy for es', () => {
      const { title, body } = notificationCopy('join_request', 'es', { name: 'Carlos', sport: 'Ciclismo' });
      expect(title).toBe('📩 Nueva solicitud de unirse');
      expect(body).toContain('Carlos');
      expect(body).toContain('Ciclismo');
      expect(body).not.toContain('wants to join');
    });
  });

  describe('join_guest template', () => {
    it('EN includes "(guest)"', () => {
      const { body } = notificationCopy('join_guest', 'en', { name: 'Sam', sport: 'Yoga' });
      expect(body).toContain('(guest)');
    });

    it('ES includes "(invitado)"', () => {
      const { body } = notificationCopy('join_guest', 'es', { name: 'Sam', sport: 'Yoga' });
      expect(body).toContain('(invitado)');
    });
  });

  describe('waitlist_offered template', () => {
    it('returns English body for en', () => {
      const { body } = notificationCopy('waitlist_offered', 'en');
      expect(body).toMatch(/spot/i);
    });

    it('returns Spanish body for es', () => {
      const { body } = notificationCopy('waitlist_offered', 'es');
      expect(body).not.toMatch(/spot/i);
      expect(body).toContain('cupo');
    });
  });

  describe('waitlist_expired template', () => {
    it('returns English for en', () => {
      const { title } = notificationCopy('waitlist_expired', 'en');
      expect(title).toContain('expired');
    });

    it('returns Spanish for es', () => {
      const { title } = notificationCopy('waitlist_expired', 'es');
      expect(title).not.toContain('expired');
      expect(title).toContain('vencida');
    });
  });

  describe('spotlight_selected template', () => {
    it('EN congratulates in English', () => {
      const { body } = notificationCopy('spotlight_selected', 'en');
      expect(body).toContain('Congratulations');
    });

    it('ES congratulates in Spanish', () => {
      const { body } = notificationCopy('spotlight_selected', 'es');
      expect(body).not.toContain('Congratulations');
      expect(body).toContain('Felicitaciones');
    });
  });

  describe('smart_match template', () => {
    it('EN body uses "also trains ... near you"', () => {
      const { body } = notificationCopy('smart_match', 'en', { name: 'Maria', sport: 'Running' });
      expect(body).toBe('Maria also trains Running near you');
    });

    it('ES body does not contain "also trains"', () => {
      const { body } = notificationCopy('smart_match', 'es', { name: 'Maria', sport: 'Running' });
      expect(body).not.toContain('also trains');
      expect(body).toContain('Maria');
      expect(body).toContain('Running');
    });
  });

  // T-NOTIF1 templates — recipient-language rendering for leave / approve / decline.
  describe('leave template', () => {
    it('EN: "X left your <sport> session"', () => {
      const { body } = notificationCopy('leave', 'en', { name: 'Ana', sport: 'Running' });
      expect(body).toBe('Ana left your Running session');
    });
    it('ES does not contain the English verb "left"', () => {
      const { body } = notificationCopy('leave', 'es', { name: 'Ana', sport: 'Running' });
      expect(body).not.toContain('left');
      expect(body).toContain('salio');
      expect(body).toContain('Ana');
    });
  });

  describe('request_approved template', () => {
    it('EN says approved and includes the session', () => {
      const { body } = notificationCopy('request_approved', 'en', { session: 'Morning Run' });
      expect(body).toContain('approved');
      expect(body).toContain('Morning Run');
    });
    it('ES says aprobada, not "approved"', () => {
      const { body } = notificationCopy('request_approved', 'es', { session: 'Morning Run' });
      expect(body).not.toContain('approved');
      expect(body).toContain('aprobada');
    });
  });

  describe('request_declined template', () => {
    it('EN says declined', () => {
      const { body } = notificationCopy('request_declined', 'en', { session: 'Morning Run' });
      expect(body).toContain('declined');
    });
    it('ES says rechazada, not "declined"', () => {
      const { body } = notificationCopy('request_declined', 'es', { session: 'Morning Run' });
      expect(body).not.toContain('declined');
      expect(body).toContain('rechazada');
    });
  });

  describe('payment_confirmed template', () => {
    it('EN says confirmed and includes the session', () => {
      const { body } = notificationCopy('payment_confirmed', 'en', { session: 'Morning Run' });
      expect(body).toContain('payment');
      expect(body).toContain('confirmed');
      expect(body).toContain('Morning Run');
    });
    it('ES says confirmado, not "confirmed"', () => {
      const { body } = notificationCopy('payment_confirmed', 'es', { session: 'Morning Run' });
      expect(body).not.toContain('confirmed');
      expect(body).toContain('pago');
      expect(body).toContain('confirmado');
    });
  });

  // T-INV1: in-app session invite, composed in the recipient's language.
  describe('session_invite template', () => {
    it('EN: "X invited you to <sport> on <date>"', () => {
      const { body } = notificationCopy('session_invite', 'en', {
        name: 'Ana',
        sport: 'Running',
        date: '2026-07-10',
      });
      expect(body).toBe('Ana invited you to Running on 2026-07-10');
    });
    it('ES does not contain the English verb "invited"', () => {
      const { body } = notificationCopy('session_invite', 'es', {
        name: 'Ana',
        sport: 'Running',
        date: '2026-07-10',
      });
      expect(body).not.toContain('invited');
      expect(body).toContain('te invito');
      expect(body).toContain('Ana');
    });
  });

  describe('variable interpolation', () => {
    it('fills {{name}} and {{sport}} from vars', () => {
      const { body } = notificationCopy('join', 'en', { name: 'Pedro', sport: 'Hiking' });
      expect(body).toBe('Pedro joined your Hiking session');
    });

    it('leaves unreferenced vars unused without throwing', () => {
      expect(() => notificationCopy('join', 'en', { name: 'X', sport: 'Y', extra: 'Z' })).not.toThrow();
    });

    it('replaces missing vars with empty string', () => {
      const { body } = notificationCopy('join', 'en', {});
      expect(body).toBe(' joined your  session');
    });
  });
});

describe('toLang', () => {
  it('returns "es" for "es"', () => {
    expect(toLang('es')).toBe('es');
  });

  it('returns "en" for null', () => {
    expect(toLang(null)).toBe('en');
  });

  it('returns "en" for undefined', () => {
    expect(toLang(undefined)).toBe('en');
  });

  it('returns "en" for an unknown locale', () => {
    expect(toLang('fr')).toBe('en');
  });

  it('returns "en" for empty string', () => {
    expect(toLang('')).toBe('en');
  });
});
