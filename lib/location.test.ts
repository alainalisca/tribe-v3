import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * T-DISC1: verifies lib/location.ts routes to the Capacitor Geolocation plugin
 * on native and keeps the browser navigator.geolocation path on web.
 */

const { isNativePlatform } = vi.hoisted(() => ({ isNativePlatform: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }));

const { checkPermissions, requestPermissions, getCurrentPosition } = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { checkPermissions, requestPermissions, getCurrentPosition },
}));

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

import { getUserLocation, requestUserLocation } from './location';

describe('location native/web branch selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('web: requestUserLocation uses navigator.geolocation, not the plugin', async () => {
    isNativePlatform.mockReturnValue(false);
    const webGeo = {
      getCurrentPosition: vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } })),
    };
    vi.stubGlobal('navigator', { geolocation: webGeo });

    const loc = await requestUserLocation();

    expect(loc).toEqual({ latitude: 1, longitude: 2 });
    expect(webGeo.getCurrentPosition).toHaveBeenCalled();
    expect(checkPermissions).not.toHaveBeenCalled();
  });

  it('native + already granted: requestUserLocation reads via the plugin without re-requesting', async () => {
    isNativePlatform.mockReturnValue(true);
    checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 6.24, longitude: -75.58 } });

    const loc = await requestUserLocation();

    expect(loc).toEqual({ latitude: 6.24, longitude: -75.58 });
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('native + prompt→granted: requestUserLocation requests permission then reads', async () => {
    isNativePlatform.mockReturnValue(true);
    checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 6, longitude: -75 } });

    const loc = await requestUserLocation();

    expect(requestPermissions).toHaveBeenCalled();
    expect(loc).toEqual({ latitude: 6, longitude: -75 });
  });

  it('native + denied: requestUserLocation returns null and never reads position', async () => {
    isNativePlatform.mockReturnValue(true);
    checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });
    requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });

    const loc = await requestUserLocation();

    expect(loc).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('native + silent getUserLocation: never prompts when not granted', async () => {
    isNativePlatform.mockReturnValue(true);
    checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' });

    const loc = await getUserLocation();

    expect(loc).toBeNull();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('native + silent getUserLocation: returns coords when already granted', async () => {
    isNativePlatform.mockReturnValue(true);
    checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'denied' });
    getCurrentPosition.mockResolvedValue({ coords: { latitude: 10, longitude: 20 } });

    const loc = await getUserLocation();

    expect(loc).toEqual({ latitude: 10, longitude: 20 });
    expect(requestPermissions).not.toHaveBeenCalled();
  });
});
