export interface Location {
  latitude: number;
  longitude: number;
}

export async function getUserLocation(): Promise<Location | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
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
        console.error('Error getting location:', error);
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
    console.error('Geocoding error:', error);
    return null;
  }
}
