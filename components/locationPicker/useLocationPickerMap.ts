'use client';

import { useState, useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { useLanguage } from '@/lib/LanguageContext';
import { loadGoogleMaps, reverseGeocodeGoogle } from '@/lib/google-maps';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import type { LeafletMapComponents } from './locationPickerTypes';

interface UseLocationPickerMapParams {
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
}

export function useLocationPickerMap({ onChange }: UseLocationPickerMapParams) {
  const { t } = useLanguage();
  const [showMap, setShowMap] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapComponents, setMapComponents] = useState<LeafletMapComponents | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Load Google Maps script
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setGoogleReady(true))
      .catch((err) => logError(err, { action: 'loadGoogleMaps' }));
  }, []);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (!googleReady || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      fields: ['formatted_address', 'name', 'geometry'],
      componentRestrictions: { country: 'co' },
    });

    // Bias results to Medellin area (~50km)
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

    Promise.all([import('leaflet'), import('react-leaflet')]).then(([L, reactLeaflet]) => {
      // REASON: Leaflet's _getIconUrl is a private property not in type defs — must delete to fix default marker icons
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
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
      logError(err, { action: 'reverseGeocode' });
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
      showError(t('geolocationNotAvailable'));
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
        logError(err, { action: 'getCurrentLocation' });
        setGettingLocation(false);
        showError(t('couldNotGetLocation'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Handle text input changes (typed, not selected from autocomplete)
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return {
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
  };
}
