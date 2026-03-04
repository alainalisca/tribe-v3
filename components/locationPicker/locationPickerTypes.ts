import type { Map as LeafletMap, LeafletMouseEvent } from 'leaflet';

export interface LeafletMapComponents {
  // REASON: react-leaflet components have complex generic props — using broad ComponentType to avoid re-declaring all prop types
  MapContainer: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  TileLayer: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  Marker: React.ComponentType<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  useMapEvents: (handlers: Record<string, (e: LeafletMouseEvent) => void>) => LeafletMap;
  useMap: () => LeafletMap;
}

export interface LocationPickerProps {
  value: string;
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  error?: string;
}

/** Default map center: Medellin */
export const DEFAULT_CENTER: [number, number] = [6.2442, -75.5812];
