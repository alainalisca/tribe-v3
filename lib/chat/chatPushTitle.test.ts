import { describe, it, expect } from 'vitest';
import { chatPushTitle } from './chatPushTitle';

/** The session-chat push title, in the recipient's language (T-LANG1). */
const CHOSE = '2026-10-20T12:00:00Z';

describe('chatPushTitle', () => {
  it('Spanish for someone who never chose, with the sport in Spanish', () => {
    expect(chatPushTitle({ preferred_language: 'en', preferred_language_set_at: null }, 'Ana', 'Running')).toBe(
      'Ana en Correr'
    );
  });

  it('English for someone who chose it', () => {
    expect(chatPushTitle({ preferred_language: 'en', preferred_language_set_at: CHOSE }, 'Ana', 'Running')).toBe(
      'Ana in Running'
    );
  });

  it('falls back to a person and a session in the reader language', () => {
    expect(chatPushTitle(null, null, null)).toBe('Alguien en tu sesión');
    expect(chatPushTitle({ preferred_language: 'en', preferred_language_set_at: CHOSE }, null, null)).toBe(
      'Someone in your session'
    );
  });
});
