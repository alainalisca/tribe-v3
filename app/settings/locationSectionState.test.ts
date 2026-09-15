import { describe, it, expect } from 'vitest';
import { computeLocationSectionState } from './useSettings';

/**
 * T-LOC1 PART B.
 *
 * The regression this guards: the location button was disabled whenever the OS
 * permission read 'granted'. Since enableLocation() is the only code path in
 * the app that writes users.location_lat/lng, every user who had allowed
 * location at the OS level was locked out of the only writer — and shown a
 * green "Location Enabled" button that was a lie about stored state.
 *
 * The load-bearing case is 'granted-unsaved': permission held, nothing stored,
 * button must be actionable.
 */
describe('computeLocationSectionState (T-LOC1 PART B)', () => {
  const stored = { location_lat: 6.2442, location_lng: -75.5812 };
  const empty = { location_lat: null, location_lng: null };

  it('granted permission with NO stored coordinates is actionable, not "done"', () => {
    expect(computeLocationSectionState('granted', empty)).toBe('granted-unsaved');
    expect(computeLocationSectionState('granted', null)).toBe('granted-unsaved');
  });

  it('shows the saved state only when coordinates are actually stored', () => {
    expect(computeLocationSectionState('granted', stored)).toBe('saved');
  });

  it('prompts when permission has not been granted yet', () => {
    expect(computeLocationSectionState('prompt', empty)).toBe('prompt');
    expect(computeLocationSectionState('prompt', null)).toBe('prompt');
  });

  it('shows denial guidance when blocked with nothing stored', () => {
    expect(computeLocationSectionState('denied', empty)).toBe('denied');
  });

  it('keeps showing stored coordinates even if permission was later revoked', () => {
    expect(computeLocationSectionState('denied', stored)).toBe('saved');
  });

  it('unsupported wins over everything', () => {
    expect(computeLocationSectionState('unsupported', stored)).toBe('unsupported');
    expect(computeLocationSectionState('unsupported', null)).toBe('unsupported');
  });

  it('treats a half-written row as not stored', () => {
    expect(computeLocationSectionState('granted', { location_lat: 6.24, location_lng: null })).toBe('granted-unsaved');
    expect(computeLocationSectionState('granted', { location_lat: null, location_lng: -75.58 })).toBe(
      'granted-unsaved'
    );
  });
});
