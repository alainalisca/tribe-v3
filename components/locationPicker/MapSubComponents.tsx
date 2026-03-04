'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, LeafletMouseEvent } from 'leaflet';
import type { LeafletMapComponents } from './locationPickerTypes';

interface MapClickHandlerProps {
  mapComponents: LeafletMapComponents | null;
  mapRef: React.MutableRefObject<LeafletMap | null>;
  position: [number, number] | null;
  onMapClick: (lat: number, lng: number) => void;
}

/** Handles map click events and syncs the map ref */
export function MapClickHandler({ mapComponents, mapRef, position, onMapClick }: MapClickHandlerProps) {
  // REASON: mapComponents is dynamically imported — hooks must still be called unconditionally
  const hookFns = mapComponents;
  const map = hookFns?.useMapEvents
    ? hookFns.useMapEvents({
        click(e: LeafletMouseEvent) {
          onMapClick(e.latlng.lat, e.latlng.lng);
        },
      })
    : null;

  useEffect(() => {
    if (map) mapRef.current = map;
  }, [map, mapRef]);

  useEffect(() => {
    if (position && map) {
      map.flyTo(position, 16, { duration: 0.5 });
    }
  }, [map, position]);

  return null;
}

interface DraggableMarkerProps {
  mapComponents: LeafletMapComponents | null;
  position: [number, number] | null;
  onDragEnd: (lat: number, lng: number) => void;
}

/** Renders a draggable marker on the map */
export function DraggableMarker({ mapComponents, position, onDragEnd }: DraggableMarkerProps) {
  const markerRef = useRef<LeafletMarker | null>(null);

  if (!mapComponents || !position) return null;
  const { Marker } = mapComponents;

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const { lat, lng } = marker.getLatLng();
        onDragEnd(lat, lng);
      }
    },
  };

  return <Marker draggable={true} eventHandlers={eventHandlers} position={position} ref={markerRef} />;
}
