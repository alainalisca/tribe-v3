import { log, logError } from '@/lib/logger';

export interface Location {
  latitude: number;
  longitude: number;
}

/**
 * Silent variant: returns the user's location only if permission was
 * previously granted. Never prompts. Use this from background flows
 * (home feed, recommendations, distance-sort widgets) so the browser
 * permission dialog doesn't pop on every page load.
 *
 * Why: the prior implementation called `getCurrentPosition()`
 * unconditionally, which prompts when permission state is 'default'
 * or 'prompt'. If the user dismissed the dialog with the X (rather
 * than picking Allow / Block), the state stays 'prompt' and the
 * dialog reappears on every navigation. Pure noise.
 *
 * Call `requestUserLocation()` from explicit user-intent flows
 * (button clicks, "find nearby" toggles) where prompting is expected.
 */
export async function getUserLocation(): Promise<Location | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    log('debug', 'Geolocation not supported', { action: 'getUserLocation' });
    return null;
  }

  // Permission API is widely supported now (Chrome, Edge, Firefox,
  // Safari 16+). When available, gate on 'granted' so we never trigger
  // the OS prompt from a background context. When unavailable (older
  // Safari, some embedded webviews), fall back to a localStorage flag
  // so we ask at most once per device.
  if (typeof navigator.permissions?.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state !== 'granted') {
        log('debug', 'location_skip_no_permission', {
          action: 'getUserLocation',
          state: status.state,
        });
        return null;
      }
    } catch (error) {
      // Permissions.query can throw on unusual configurations
      // (e.g. iframe sandboxes). Fall through to the localStorage gate.
      logError(error, { action: 'getUserLocation.permissions_query' });
    }
  } else {
    // Older browser without Permissions API. Use a localStorage gate
    // to ensure we don't auto-prompt on every page load — the user
    // gets at most one ask per device, ever (until they clear data).
    try {
      if (typeof localStorage !== 'undefined') {
        const asked = localStorage.getItem('location-auto-ask-done');
        if (asked) return null;
        localStorage.setItem('location-auto-ask-done', String(Date.now()));
      }
    } catch {
      // localStorage can throw in private-mode iframes; degrade
      // silently and proceed (still better than infinite-loop).
    }
  }

  return getCurrentPosition();
}

/**
 * Explicit-intent variant: always attempts to fetch location,
 * prompting the user if necessary. Use only from button-driven flows
 * where the user has signalled they want their location used right
 * now (e.g. "find nearby" toggle, location picker, training-partner
 * search).
 */
export async function requestUserLocation(): Promise<Location | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    log('debug', 'Geolocation not supported', { action: 'requestUserLocation' });
    return null;
  }
  return getCurrentPosition();
}

/** Shared underlying getCurrentPosition wrapper with consistent options. */
function getCurrentPosition(): Promise<Location | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        logError(error, { action: 'getCurrentPosition' });
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  });
}

/** Haversine distance between two lat/lng points in km */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fuzz a location to ~500m precision for privacy.
 * Rounds coordinates so exact home/office locations can't be determined.
 * Use for USER locations in API responses (NOT for venue/business locations).
 */
export function fuzzLocation(lat: number, lng: number, precisionKm: number = 0.5): { lat: number; lng: number } {
  const precision = precisionKm / 111; // 1 degree ≈ 111km
  return {
    lat: Math.round(lat / precision) * precision,
    lng: Math.round(lng / precision) * precision,
  };
}

// Geocode text address to lat/lng using Google Maps Geocoder
export async function geocodeAddress(address: string): Promise<Location | null> {
  try {
    const { loadGoogleMaps } = await import('@/lib/google-maps');
    await loadGoogleMaps();

    const geocoder = new google.maps.Geocoder();
    const { results } = await geocoder.geocode({ address });

    if (results?.[0]?.geometry?.location) {
      return {
        latitude: results[0].geometry.location.lat(),
        longitude: results[0].geometry.location.lng(),
      };
    }

    return null;
  } catch (error) {
    logError(error, { action: 'geocodeAddress' });
    return null;
  }
}
