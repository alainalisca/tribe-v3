import { describe, it, expect } from 'vitest';
import { avatarInitials, usableAvatarUrl } from './avatarSrc';

/** T-JOIN1 Part C: a stock photo or a malformed URL is no avatar. */
describe('usableAvatarUrl', () => {
  it.each([
    'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400',
    'https://plus.unsplash.com/premium_photo-1',
    'https://source.unsplash.com/random',
    '',
    '   ',
    'not a url',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '//evil.example/x.png',
  ])('refuses %s', (url) => {
    expect(usableAvatarUrl(url)).toBeNull();
  });

  it.each([
    'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/a.jpg',
    'https://lh3.googleusercontent.com/a/abc=s96-c',
    '/images/coach.jpg',
  ])('keeps %s', (url) => {
    expect(usableAvatarUrl(url)).toBe(url);
  });

  it('is null for null and undefined', () => {
    expect(usableAvatarUrl(null)).toBeNull();
    expect(usableAvatarUrl(undefined)).toBeNull();
  });
});

describe('avatarInitials', () => {
  it.each([
    ['ana gómez', 'AG'],
    ['Salomon Tabares Adarve', 'ST'],
    ['Neera', 'N'],
    ['  ', '?'],
    [null, '?'],
    ['Ñata Ruiz', 'ÑR'],
  ])('%s -> %s', (name, expected) => {
    expect(avatarInitials(name)).toBe(expected);
  });
});
