'use client';

import { useState, useEffect } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import map to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const useMapEvents = dynamic(
  () => import('react-leaflet').then((mod) => mod.useMapEvents),
  { ssr: false }
) as any;

interface LocationPickerProps {
  value: string;
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  error?: string;
}

function LocationMarker({ position, setPosition }: { position: [number, number] | null; setPosition: (pos: [number, number]) => void }) {
  const map = useMapEvents({
    click(e: any) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position ? <Marker position={position} /> : null;
}

export default function LocationPicker({ value, onChange, placeholder, error }: LocationPickerProps) {
  const [showMap, setShowMap] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Default to Medellín
  const defaultCenter: [number, number] = [6.2442, -75.5812];

  useEffect(() => {
    // Load Leaflet CSS
    if (typeof window !== 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      
      // Fix default marker icon
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
        setMapReady(true);
      });
    }
  }, []);

  async function searchLocation() {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setPosition([parseFloat(lat), parseFloat(lon)]);
        onChange(display_name, { lat: parseFloat(lat), lng: parseFloat(lon) });
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data && data.display_name) {
        onChange(data.display_name, { lat, lng });
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
  }

  function handlePositionChange(pos: [number, number]) {
    setPosition(pos);
    reverseGeocode(pos[0], pos[1]);
  }

  function getCurrentLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newPos);
          reverseGeocode(newPos[0], newPos[1]);
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 p-3 border rounded-lg bg-theme-card text-theme-primary ${
            error ? 'border-red-500' : 'border-theme'
          }`}
        />
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="px-4 py-3 bg-tribe-green text-slate-900 rounded-lg hover:bg-lime-500 transition flex items-center gap-2"
        >
          <MapPin className="w-5 h-5" />
        </button>
      </div>
      
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}

      {showMap && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#404549] rounded-xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-stone-200 dark:border-gray-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-theme-primary">Select Location</h3>
                <button onClick={() => setShowMap(false)} className="p-1 hover:bg-stone-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
                  placeholder="Search address..."
                  className="flex-1 p-2 border rounded-lg text-sm"
                />
                <button
                  onClick={searchLocation}
                  disabled={searching}
                  className="px-3 py-2 bg-tribe-green text-slate-900 rounded-lg text-sm disabled:opacity-50"
                >
                  {searching ? '...' : <Search className="w-4 h-4" />}
                </button>
                <button
                  onClick={getCurrentLocation}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm"
                  title="Use my location"
                >
                  📍
                </button>
              </div>
            </div>

            <div className="h-72">
              {mapReady && (
                <MapContainer
                  center={position || defaultCenter}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <ClickHandler onPositionChange={handlePositionChange} position={position} />
                </MapContainer>
              )}
            </div>

            <div className="p-4 border-t border-stone-200 dark:border-gray-600">
              <p className="text-xs text-stone-500 mb-3">Tap on the map to select a location</p>
              <button
                onClick={() => setShowMap(false)}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg"
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Separate component for click handling
function ClickHandler({ onPositionChange, position }: { onPositionChange: (pos: [number, number]) => void; position: [number, number] | null }) {
  const { useMapEvents, Marker } = require('react-leaflet');
  
  const map = useMapEvents({
    click(e: any) {
      onPositionChange([e.latlng.lat, e.latlng.lng]);
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo(position, 16);
    }
  }, [position, map]);

  return position ? <Marker position={position} /> : null;
}
