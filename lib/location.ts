import { log, logError } from '@/lib/logger';

export interface Location {
  latitude: number;
  longitude: number;
}

export async function getUserLocation(): Promise<Location | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      log('error', 'Geolocation not supported', { action: 'getUserLocation' });
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        logError(error, { action: 'getUserLocation' });
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
