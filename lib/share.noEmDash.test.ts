/**
 * T-AUD15: the generated share message carried an em dash.
 *
 * `buildSessionShareText` joined its two lines with ` — `, so every WhatsApp
 * share read "Basketball with Kraken in Centro — Thu, Sep 24 · 1:17 PM · Free".
 * Em dashes are banned across the product including UI copy, and this string is
 * the one a coach forwards to their own athletes.
 *
 * Asserted on the BUILT STRING rather than on the source, because the separator
 * is what ships. A source assertion would pass if the constant moved.
 */
import { describe, it, expect } from 'vitest';
import { buildSessionShareText, type SessionShareData } from './share';

const DASHES = /[—–]/; // em dash, en dash

// Typed as SessionShareData rather than cast. The first version of this fixture
// invented field names (hostName, location, startTime) and cast with `as never`,
// so the builder silently received undefined for all three and the separator
// under test was never exercised on a full string. The cast hid the mismatch.
const session: SessionShareData = {
  id: 'f2d1b0c4-1111-2222-3333-444455556666',
  title: 'Basketball',
  sport: 'Basketball',
  date: '2026-09-24',
  time: '13:17',
  priceCents: null,
  neighborhood: 'Centro',
  instructorName: 'Kraken',
  spotsLeft: 3,
};

describe('T-AUD15 share text carries no em dash', () => {
  it('English', () => {
    const text = buildSessionShareText(session, 'en');
    expect(text).not.toMatch(DASHES);
  });

  it('Spanish', () => {
    const text = buildSessionShareText(session, 'es');
    expect(text).not.toMatch(DASHES);
  });

  it('still separates the two lines rather than running them together', () => {
    const text = buildSessionShareText(session, 'en');
    expect(text).toContain('Centro · ');
  });
});
