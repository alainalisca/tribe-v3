'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { loadGoogleMaps, reverseGeocodeGoogle } from '@/lib/google-maps';

interface LocationPickerProps {
  value: string;
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  error?: string;
}

export default function LocationPicker({ value, onChange, placeholder, error }: LocationPickerProps) {
  const { language } = useLanguage();
  const [showMap, setShowMap] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapComponents, setMapComponents] = useState<any>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const mapRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Default to Medellín
  const defaultCenter: [number, number] = [6.2442, -75.5812];

  // Load Google Maps script
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setGoogleReady(true))
      .catch((err) => console.error('Google Maps load error:', err));
  }, []);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!googleReady || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      fields: ['formatted_address', 'name', 'geometry'],
      componentRestrictions: { country: 'co' },
    });

    // Bias results to Medellín area (~50km)
    autocomplete.setBounds(
      new google.maps.LatLngBounds(
        new google.maps.LatLng(6.2442 - 0.45, -75.5812 - 0.45),
        new google.maps.LatLng(6.2442 + 0.45, -75.5812 + 0.45)
      )
    );

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const name = place.name || place.formatted_address || '';
        setPosition([lat, lng]);
        onChange(name, { lat, lng });
        setShowMap(true);
      }
    });

    autocompleteRef.current = autocomplete;
  }, [googleReady, onChange]);

  // Load Leaflet components for the map
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const existingLink = document.querySelector('link[href*="leaflet"]');
    if (!existingLink) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    Promise.all([
      import('leaflet'),
      import('react-leaflet')
    ]).then(([L, reactLeaflet]) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      setMapComponents({
        MapContainer: reactLeaflet.MapContainer,
        TileLayer: reactLeaflet.TileLayer,
        Marker: reactLeaflet.Marker,
        useMapEvents: reactLeaflet.useMapEvents,
        useMap: reactLeaflet.useMap,
      });
      setMapReady(true);
    });
  }, []);

  // Handle text input changes (typed, not selected from autocomplete)
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  // Reverse geocode coordinates to address via Google
  async function reverseGeocode(lat: number, lng: number) {
    setReverseGeocoding(true);
    try {
      const name = await reverseGeocodeGoogle(lat, lng);
      if (name) {
        onChange(name, { lat, lng });
      } else {
        onChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, { lat, lng });
      }
    } catch (err) {
      console.error('Reverse geocode error:', err);
      onChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, { lat, lng });
    } finally {
      setReverseGeocoding(false);
    }
  }

  // Handle map click to drop pin
  function handleMapClick(lat: number, lng: number) {
    setPosition([lat, lng]);
    reverseGeocode(lat, lng);
  }

  // Handle marker drag end
  function handleMarkerDragEnd(lat: number, lng: number) {
    setPosition([lat, lng]);
    reverseGeocode(lat, lng);
  }

  // Get user's current location
  function getCurrentLocation() {
    if (!navigator.geolocation) {
      alert(language === 'es' ? 'Geolocalización no disponible' : 'Geolocation not available');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setPosition(newPos);
        reverseGeocode(newPos[0], newPos[1]);
        setShowMap(true);
        setGettingLocation(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setGettingLocation(false);
        alert(language === 'es'
          ? 'No se pudo obtener tu ubicación. Por favor, selecciona en el mapa.'
          : 'Could not get your location. Please select on the map.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Map click handler component
  function MapClickHandler() {
    // REASON: mapComponents is dynamically imported — hooks must still be called unconditionally
    const hookFns = mapComponents;
    const map = hookFns?.useMapEvents
      ? hookFns.useMapEvents({
          click(e: any) {
            handleMapClick(e.latlng.lat, e.latlng.lng);
          },
        })
      : null;

    useEffect(() => {
      if (map) mapRef.current = map;
    }, [map]);

    useEffect(() => {
      if (position && map) {
        map.flyTo(position, 16, { duration: 0.5 });
      }
    }, [position, map]);

    return null;
  }

  // Draggable marker component
  function DraggableMarker() {
    const markerRef = useRef<any>(null);

    if (!mapComponents || !position) return null;
    const { Marker } = mapComponents;

    const eventHandlers = {
      dragend() {
        const marker = markerRef.current;
        if (marker) {
          const { lat, lng } = marker.getLatLng();
          handleMarkerDragEnd(lat, lng);
        }
      },
    };

    return (
      <Marker
        draggable={true}
        eventHandlers={eventHandlers}
        position={position}
        ref={markerRef}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* Text input with Google Places Autocomplete */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={`w-full p-3 pr-10 border rounded-lg bg-theme-card text-theme-primary ${
                error ? 'border-red-500' : 'border-theme'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowMap(!showMap)}
            className={`px-4 py-3 rounded-lg transition flex items-center gap-2 ${
              showMap
                ? 'bg-tribe-green text-slate-900'
                : 'bg-stone-200 dark:bg-[#52575D] text-theme-primary hover:bg-stone-300 dark:hover:bg-[#6B7178]'
            }`}
            title={language === 'es' ? 'Seleccionar en mapa' : 'Select on map'}
          >
            <MapPin className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Inline map */}
      {showMap && (
        <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-gray-600 bg-stone-100 dark:bg-[#52575D]">
          {/* Map header */}
          <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#404549] border-b border-stone-200 dark:border-gray-600">
            <span className="text-xs text-stone-500 dark:text-gray-400">
              {language === 'es' ? 'Toca el mapa o arrastra el marcador' : 'Tap map or drag marker'}
            </span>
            <button
              type="button"
              onClick={getCurrentLocation}
              disabled={gettingLocation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition"
            >
              {gettingLocation ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Navigation className="w-3.5 h-3.5" />
              )}
              {language === 'es' ? 'Mi ubicación' : 'My location'}
            </button>
          </div>

          {/* Map container */}
          <div className="h-64 relative">
            {mapReady && mapComponents ? (
              <mapComponents.MapContainer
                center={position || defaultCenter}
                zoom={position ? 16 : 13}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
                attributionControl={false}
              >
                <mapComponents.TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickHandler />
                <DraggableMarker />
              </mapComponents.MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-tribe-green animate-spin" />
              </div>
            )}

            {/* Loading overlay for reverse geocoding */}
            {reverseGeocoding && (
              <div className="absolute bottom-2 left-2 right-2 bg-white dark:bg-[#404549] rounded-lg px-3 py-2 shadow-lg flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-tribe-green animate-spin" />
                <span className="text-xs text-theme-primary">
                  {language === 'es' ? 'Obteniendo dirección...' : 'Getting address...'}
                </span>
              </div>
            )}
          </div>

          {/* Selected location display */}
          {position && value && (
            <div className="px-3 py-2 bg-tribe-green/10 border-t border-tribe-green/20">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-tribe-green flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-theme-primary font-medium truncate">{value}</p>
                  <p className="text-xs text-stone-500 dark:text-gray-400">
                    {position[0].toFixed(6)}, {position[1].toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Show selected location when map is closed */}
      {!showMap && position && value && (
        <div className="flex items-center gap-2 px-3 py-2 bg-tribe-green/10 rounded-lg border border-tribe-green/20">
          <MapPin className="w-4 h-4 text-tribe-green flex-shrink-0" />
          <span className="text-sm text-theme-primary truncate flex-1">{value}</span>
          <button
            type="button"
            onClick={() => {
              setPosition(null);
              onChange('');
            }}
            className="p-1 hover:bg-stone-200 dark:hover:bg-[#52575D] rounded"
          >
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>
      )}
    </div>
  );
}
