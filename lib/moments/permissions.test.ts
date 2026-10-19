import { describe, it, expect } from 'vitest';
import { canGrantPhotographer, canUploadToSession, type UploadContext } from './permissions';

/** T-MOM1: the upload permission matrix (host, admin, photographer, participant, stranger). */
const base: UploadContext = {
  userId: 'u',
  hostId: 'host',
  isAdmin: false,
  isPhotographer: false,
  sessionStatus: 'active',
};

describe('canUploadToSession', () => {
  it.each([
    ['host', { userId: 'host' }, true],
    ['admin', { isAdmin: true }, true],
    ['photographer', { isPhotographer: true }, true],
    ['participant (not named photographer)', {}, false],
    ['stranger', { userId: 'someone' }, false],
    ['signed out', { userId: null }, false],
  ] as const)('%s', (_label, over, expected) => {
    expect(canUploadToSession({ ...base, ...over })).toBe(expected);
  });

  it('a cancelled session takes no new photos, even from its host', () => {
    expect(canUploadToSession({ ...base, userId: 'host', sessionStatus: 'cancelled' })).toBe(false);
  });

  it('a session with no host refuses everyone', () => {
    expect(canUploadToSession({ ...base, hostId: null, isAdmin: true })).toBe(false);
  });
});

describe('canGrantPhotographer', () => {
  it('host and admin may name a photographer; a photographer may not name another', () => {
    expect(canGrantPhotographer({ ...base, userId: 'host' })).toBe(true);
    expect(canGrantPhotographer({ ...base, isAdmin: true })).toBe(true);
    expect(canGrantPhotographer({ ...base, isPhotographer: true })).toBe(false);
  });
});
