import { describe, it, expect } from 'vitest';
import { resolveAvatarUrl } from './avatar';

describe('resolveAvatarUrl', () => {
  it('prefers a set avatar_url', () => {
    expect(resolveAvatarUrl('https://x/a.jpg', ['https://x/p.jpg'])).toBe('https://x/a.jpg');
  });

  it('falls back to the first photo when avatar_url is null', () => {
    expect(resolveAvatarUrl(null, ['https://x/p.jpg', 'https://x/p2.jpg'])).toBe('https://x/p.jpg');
  });

  it('falls back to the first photo when avatar_url is empty/whitespace', () => {
    expect(resolveAvatarUrl('', ['https://x/p.jpg'])).toBe('https://x/p.jpg');
    expect(resolveAvatarUrl('   ', ['https://x/p.jpg'])).toBe('https://x/p.jpg');
  });

  it('returns null when neither is set', () => {
    expect(resolveAvatarUrl(null, null)).toBeNull();
    expect(resolveAvatarUrl(undefined, [])).toBeNull();
    expect(resolveAvatarUrl('', ['', '  '])).toBeNull();
  });

  it('skips blank leading photos and returns the first usable one', () => {
    expect(resolveAvatarUrl(null, ['', 'https://x/real.jpg'])).toBe('https://x/real.jpg');
  });
});
