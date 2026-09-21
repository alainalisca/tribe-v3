import { describe, it, expect } from 'vitest';
import { upgradeProviderAvatarUrl } from './providerAvatar';

/**
 * Verified against a real stored URL before this was written:
 *   ...=s96-c  -> 96 x 96,  3,165 bytes
 *   ...=s600-c -> 600 x 600, 45,551 bytes
 * Google honours the parameter; the rewrite is one substitution.
 */
const GOOGLE = 'https://lh3.googleusercontent.com/a/ACg8ocIiGwPlRogYkgbt2nUS8BkcPUF2TOk4vD4j9FCzVI2fAgkcIjbTvw';

describe('upgradeProviderAvatarUrl', () => {
  it('upgrades the 96px Google default to 600px', () => {
    expect(upgradeProviderAvatarUrl(`${GOOGLE}=s96-c`)).toBe(`${GOOGLE}=s600-c`);
  });

  it('upgrades any size, not just 96', () => {
    expect(upgradeProviderAvatarUrl(`${GOOGLE}=s128-c`)).toBe(`${GOOGLE}=s600-c`);
  });

  it('is idempotent, so the migration can run twice', () => {
    expect(upgradeProviderAvatarUrl(`${GOOGLE}=s600-c`)).toBe(`${GOOGLE}=s600-c`);
  });

  /** Appending a size parameter to an unknown URL shape is how a working
   *  avatar becomes a 404. Leave it alone. */
  it('leaves a Google URL with NO size suffix untouched', () => {
    expect(upgradeProviderAvatarUrl(GOOGLE)).toBe(GOOGLE);
  });

  it('only matches the suffix, not the same text mid-url', () => {
    const odd = `https://lh3.googleusercontent.com/a/=s96-c/photo.jpg`;
    expect(upgradeProviderAvatarUrl(odd)).toBe(odd);
  });

  it('leaves a self-uploaded Supabase avatar untouched', () => {
    const up = 'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/avatars/x-1.jpeg';
    expect(upgradeProviderAvatarUrl(up)).toBe(up);
  });

  /** The host check must do work of its own. A non-Google URL that HAPPENS to
   *  end in the same suffix must be left alone -- without this, deleting the
   *  googleusercontent check breaks nothing and the scope is decorative. */
  it('leaves a NON-Google url ending in =s96-c untouched', () => {
    const other = 'https://cdn.example.com/avatars/abc=s96-c';
    expect(upgradeProviderAvatarUrl(other)).toBe(other);
  });

  it('handles null and undefined', () => {
    expect(upgradeProviderAvatarUrl(null)).toBeNull();
    expect(upgradeProviderAvatarUrl(undefined)).toBeNull();
  });
});
