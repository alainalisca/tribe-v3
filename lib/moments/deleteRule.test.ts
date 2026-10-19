import { describe, it, expect } from 'vitest';
import { canDeleteMoment } from './deleteRule';

describe('canDeleteMoment (T-MOM1)', () => {
  const m = { uploaderId: 'up', hostId: 'host', isAdmin: false };
  it.each([
    ['uploader', { userId: 'up' }, true],
    ['host', { userId: 'host' }, true],
    ['admin', { userId: 'x', isAdmin: true }, true],
    ['another photographer', { userId: 'other' }, false],
    ['signed out', { userId: null }, false],
  ] as const)('%s', (_l, over, expected) => {
    expect(canDeleteMoment({ ...m, ...over })).toBe(expected);
  });
});
