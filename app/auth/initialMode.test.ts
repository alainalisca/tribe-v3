import { describe, it, expect } from 'vitest';
import { opensOnSignIn } from './initialMode';

const p = (q: string) => new URLSearchParams(q);

describe('opensOnSignIn', () => {
  it('opens an invite link (/auth/?ref=CODE) on sign-up', () => {
    expect(opensOnSignIn(p('ref=TRIBE-HCHP7'))).toBe(false);
    expect(opensOnSignIn(p('ref=TRIBE-HCHP7&utm_source=whatsapp'))).toBe(false);
  });

  it('keeps a plain /auth, and a blank ref, on sign-in', () => {
    expect(opensOnSignIn(p(''))).toBe(true);
    expect(opensOnSignIn(p('ref='))).toBe(true);
    expect(opensOnSignIn(p('ref=%20'))).toBe(true);
    expect(opensOnSignIn(p('returnTo=%2Fs%2Fabc'))).toBe(true);
  });

  it('lets an explicit mode win over ref (a reset-password link stays one)', () => {
    expect(opensOnSignIn(p('mode=reset-password&ref=TRIBE-HCHP7'))).toBe(true);
  });
});
