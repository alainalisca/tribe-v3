let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
    if (!key) {
      loadPromise = null;
      reject(new Error('Google Places API key not configured'));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function reverseGeocodeGoogle(
  lat: number,
  lng: number
): Promise<string | null> {
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  const { results } = await geocoder.geocode({ location: { lat, lng } });
  if (results?.[0]) {
    const parts = results[0].formatted_address.split(',').map(p => p.trim());
    return parts.length <= 2
      ? results[0].formatted_address
      : parts.slice(0, 3).join(', ');
  }
  return null;
}
