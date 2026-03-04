'use client';

import { MapPin, Navigation, Loader2, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { LocationPickerProps } from './locationPicker/locationPickerTypes';
import { DEFAULT_CENTER } from './locationPicker/locationPickerTypes';
import { useLocationPickerMap } from './locationPicker/useLocationPickerMap';
import { MapClickHandler, DraggableMarker } from './locationPicker/MapSubComponents';

export default function LocationPicker({ value, onChange, placeholder, error }: LocationPickerProps) {
  const { language } = useLanguage();

  const {
    showMap,
    setShowMap,
    position,
    setPosition,
    mapReady,
    reverseGeocoding,
    gettingLocation,
    mapComponents,
    mapRef,
    inputRef,
    handleMapClick,
    handleMarkerDragEnd,
    getCurrentLocation,
    handleInputChange,
  } = useLocationPickerMap({ onChange });

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
                center={position || DEFAULT_CENTER}
                zoom={position ? 16 : 13}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
                attributionControl={false}
              >
                <mapComponents.TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClickHandler
                  mapComponents={mapComponents}
                  mapRef={mapRef}
                  position={position}
                  onMapClick={handleMapClick}
                />
                <DraggableMarker mapComponents={mapComponents} position={position} onDragEnd={handleMarkerDragEnd} />
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
