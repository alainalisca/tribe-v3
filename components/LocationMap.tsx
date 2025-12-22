'use client';

import { useState, useEffect } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import dynamic from 'next/dynamic';

interface LocationMapProps {
  latitude?: number | null;
  longitude?: number | null;
  location: string;
}

export default function LocationMap({ latitude, longitude, location }: LocationMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const [MapContainer, setMapContainer] = useState<any>(null);
  const [TileLayer, setTileLayer] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && latitude && longitude) {
      // Load Leaflet CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      // Load components
      import('react-leaflet').then((mod) => {
        setMapContainer(() => mod.MapContainer);
        setTileLayer(() => mod.TileLayer);
        setMarker(() => mod.Marker);
      });

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
  }, [latitude, longitude]);

  function openInMaps() {
    if (latitude && longitude) {
      // Try to open in native maps app, fallback to Google Maps
      const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      window.open(url, '_blank');
    } else {
      // Search by location name
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      window.open(url, '_blank');
    }
  }

  // If no coordinates, show a button to open in maps
  if (!latitude || !longitude) {
    return (
      <button
        onClick={openInMaps}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition"
      >
        <Navigation className="w-5 h-5" />
        Open in Maps
      </button>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-gray-600">
      <div className="h-40 bg-stone-100 dark:bg-[#52575D]">
        {mapReady && MapContainer && TileLayer && Marker ? (
          <MapContainer
            center={[latitude, longitude]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
            dragging={false}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[latitude, longitude]} />
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center">
            <MapPin className="w-8 h-8 text-stone-400 animate-pulse" />
          </div>
        )}
      </div>
      <button
        onClick={openInMaps}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500 text-white font-medium hover:bg-blue-600 transition"
      >
        <Navigation className="w-5 h-5" />
        Get Directions
      </button>
    </div>
  );
}
