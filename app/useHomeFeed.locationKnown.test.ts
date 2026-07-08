import { describe, it, expect } from 'vitest';
import { computeLocationKnown } from './useHomeFeed';

/**
 * BUG-008: the Enable-location banner was gated only on transient in-memory
 * coords, so it reappeared on every reload after the user had granted location.
 * computeLocationKnown now also honors the real permission and stored coords.
 */
describe('computeLocationKnown (BUG-008)', () => {
  const coords = { latitude: 6.24, longitude: -75.58 };

  it('true when in-memory coords are present', () => {
    expect(computeLocationKnown(coords, null, null)).toBe(true);
  });

  it('true when the permission is granted (even with no coords yet)', () => {
    expect(computeLocationKnown(null, 'granted', null)).toBe(true);
  });

  it('true when the profile has stored coordinates', () => {
    expect(computeLocationKnown(null, null, { location_lat: 6.24, location_lng: -75.58 })).toBe(true);
  });

  it('false when nothing is known (fresh, ungranted)', () => {
    expect(computeLocationKnown(null, 'prompt', null)).toBe(false);
    expect(computeLocationKnown(null, null, null)).toBe(false);
  });

  it('false when permission is denied and no coords anywhere', () => {
    expect(computeLocationKnown(null, 'denied', { location_lat: null, location_lng: null })).toBe(false);
  });

  it('requires BOTH stored lat and lng (a half-set profile is not known)', () => {
    expect(computeLocationKnown(null, null, { location_lat: 6.24, location_lng: null })).toBe(false);
    expect(computeLocationKnown(null, null, { location_lat: null, location_lng: -75.58 })).toBe(false);
  });
});
