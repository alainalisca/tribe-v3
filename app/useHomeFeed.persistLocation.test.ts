import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dal', () => ({
  updateUser,
  // The module under test imports these from the same barrel; they are unused
  // by persistLocationIfMissing but must exist for the import to resolve.
  fetchUpcomingSessions: vi.fn(),
  fetchUserProfileMaybe: vi.fn(),
  fetchMyLocation: vi.fn(),
  fetchRecapPhotosByCreators: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logError, log: vi.fn() }));

import { persistLocationIfMissing } from './useHomeFeed';

/**
 * T-LOC1 PART A.
 *
 * The regression this guards: every geolocation call site except the settings
 * button obtained coordinates and dropped them into React state, so nothing
 * was ever written to users.location_lat/lng. Live, 0 of 104 users had
 * coordinates, which emptied nearby-athletes, the smart-match cron and every
 * distance display for everyone.
 *
 * The load-bearing assertion is the first one: obtaining coordinates while the
 * stored value is null MUST result in a write.
 */
describe('persistLocationIfMissing (T-LOC1 PART A)', () => {
  const supabase = {} as never;
  const coords = { latitude: 6.2442, longitude: -75.5812 };

  beforeEach(() => {
    updateUser.mockReset();
    logError.mockReset();
    updateUser.mockResolvedValue({ success: true });
  });

  it('PERSISTS the coordinates when the stored value is null', async () => {
    const wrote = await persistLocationIfMissing(supabase, 'user-1', coords, {
      location_lat: null,
      location_lng: null,
    });

    expect(wrote).toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith(supabase, 'user-1', {
      location_lat: 6.2442,
      location_lng: -75.5812,
    });
  });

  it('PERSISTS when there is no stored profile row at all', async () => {
    const wrote = await persistLocationIfMissing(supabase, 'user-1', coords, null);

    expect(wrote).toBe(true);
    expect(updateUser).toHaveBeenCalledWith(supabase, 'user-1', {
      location_lat: 6.2442,
      location_lng: -75.5812,
    });
  });

  it('repairs a half-written row (lat set, lng null)', async () => {
    const wrote = await persistLocationIfMissing(supabase, 'user-1', coords, {
      location_lat: 1.23,
      location_lng: null,
    });

    expect(wrote).toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
  });

  it('does NOT overwrite coordinates that are already stored', async () => {
    const wrote = await persistLocationIfMissing(supabase, 'user-1', coords, {
      location_lat: 4.711,
      location_lng: -74.072,
    });

    expect(wrote).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('never throws and never surfaces a failed write; it logs instead', async () => {
    updateUser.mockResolvedValue({ success: false, error: 'no_rows_updated' });

    await expect(
      persistLocationIfMissing(supabase, 'user-1', coords, { location_lat: null, location_lng: null })
    ).resolves.toBe(true);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][1]).toMatchObject({ action: 'persistLocationIfMissing', userId: 'user-1' });
  });
});
