'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, Navigation, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface LocationPickerProps {
  value: string;
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  error?: string;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationPicker({ value, onChange, placeholder, error }: LocationPickerProps) {
  const { language } = useLanguage();
  const [showMap, setShowMap] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapComponents, setMapComponents] = useState<any>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapRef = useRef<any>(null);

  // Default to Medellin
  const defaultCenter: [number, number] = [6.2442, -75.5812];

  // Load Leaflet components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load Leaflet CSS
      const existingLink = document.querySelector('link[href*="leaflet"]');
      if (!existingLink) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load Leaflet and react-leaflet
      Promise.all([
        import('leaflet'),
        import('react-leaflet')
      ]).then(([L, reactLeaflet]) => {
        // Fix default marker icon
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
    }
  }, []);

  // Debounced search for address suggestions
  const searchAddress = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=co`,
        { headers: { 'Accept-Language': language } }
      );
      const data = await response.json();
      setSearchResults(data || []);
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [language]);

  // Handle text input changes with debounce
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    onChange(newValue);
    setSearchQuery(newValue);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search
    searchTimeoutRef.current = setTimeout(() => {
      searchAddress(newValue);
    }, 500);
  }

  // Select a search result
  function selectSearchResult(result: SearchResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Extract shorter location name
    const shortName = formatLocationName(result.display_name);

    setPosition([lat, lng]);
    onChange(shortName, { lat, lng });
    setSearchResults([]);
    setShowResults(false);
    setSearchQuery('');

    // Open map to show selected location
    setShowMap(true);
  }

  // Format location name to be shorter and more readable
  function formatLocationName(fullName: string): string {
    const parts = fullName.split(',').map(p => p.trim());
    // Return first 2-3 meaningful parts
    if (parts.length <= 2) return fullName;
    return parts.slice(0, 3).join(', ');
  }

  // Reverse geocode coordinates to address
  async function reverseGeocode(lat: number, lng: number) {
    setReverseGeocoding(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
        { headers: { 'Accept-Language': language } }
      );
      const data = await response.json();
      if (data && data.display_name) {
        const shortName = formatLocationName(data.display_name);
        onChange(shortName, { lat, lng });
      } else {
        // If no address found, just use coordinates
        onChange(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, { lat, lng });
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
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

  // Get user's current location (optional, user-initiated)
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
      (error) => {
        console.error('Geolocation error:', error);
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
    if (!mapComponents) return null;
    const { useMapEvents, useMap } = mapComponents;

    const map = useMapEvents({
      click(e: any) {
        handleMapClick(e.latlng.lat, e.latlng.lng);
      },
    });

    // Store map reference
    useEffect(() => {
      mapRef.current = map;
    }, [map]);

    // Fly to position when it changes
    useEffect(() => {
      if (position && map) {
        map.flyTo(position, 16, { duration: 0.5 });
      }
    }, [position, map]);

    return null;
  }

  // Draggable marker component
  function DraggableMarker() {
    if (!mapComponents || !position) return null;
    const { Marker } = mapComponents;
    const markerRef = useRef<any>(null);

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
      {/* Text input with search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={value}
              onChange={handleInputChange}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder={placeholder}
              className={`w-full p-3 pr-10 border rounded-lg bg-theme-card text-theme-primary ${
                error ? 'border-red-500' : 'border-theme'
              }`}
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 animate-spin" />
            )}
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

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#404549] border border-stone-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searchResults.map((result, index) => (
              <button
                key={index}
                type="button"
                onClick={() => selectSearchResult(result)}
                className="w-full text-left px-4 py-3 hover:bg-stone-100 dark:hover:bg-[#52575D] border-b border-stone-100 dark:border-gray-700 last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-tribe-green flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-theme-primary line-clamp-2">
                    {result.display_name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
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
