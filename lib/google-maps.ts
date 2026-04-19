let loadPromise: Promise<void> | null = null;

/**
 * Loads the Google Maps JavaScript SDK for Places Autocomplete.
 * The NEXT_PUBLIC_GOOGLE_PLACES_KEY must have HTTP referrer restrictions
 * configured in Google Cloud Console to limit it to your domain(s) only,
 * and should be scoped to the Maps JavaScript API and Places API only.
 */
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

/**
 * Reverse geocodes coordinates via the server-side /api/geocode proxy.
 * This keeps the Google API key server-side for geocoding operations,
 * reducing client-side key exposure to only what the Places Autocomplete
 * widget requires.
 */
export async function reverseGeocodeGoogle(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const response = await fetch(`/api/geocode?lat=${lat}&lon=${lng}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
