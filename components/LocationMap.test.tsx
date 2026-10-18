import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const lang = vi.hoisted(() => ({ current: 'es' as 'es' | 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: lang.current, t: (k: string) => k }) }));
vi.mock('react-leaflet', () => ({ MapContainer: () => null, TileLayer: () => null, Marker: () => null }));
// The component reads L.Icon off the module namespace (named export), after the test may have ended.
const icon = vi.hoisted(() => ({ Default: { prototype: {}, mergeOptions: () => {} } }));
vi.mock('leaflet', () => ({ Icon: icon, default: { Icon: icon } }));

import LocationMap from './LocationMap';

/** T-UI-SD1: the map button speaks the app's language, in the brand green. */
describe('LocationMap', () => {
  it('says "Cómo llegar" in Spanish and "Get directions" in English', () => {
    const { unmount } = render(<LocationMap latitude={6.2} longitude={-75.56} location="Parque Lleras" />);
    const es = screen.getByRole('button', { name: 'Cómo llegar' });
    expect(es.className).toContain('bg-tribe-green');
    expect(es.className).not.toContain('bg-blue');
    unmount();
    lang.current = 'en';
    render(<LocationMap latitude={6.2} longitude={-75.56} location="Parque Lleras" />);
    expect(screen.getByRole('button', { name: 'Get directions' })).toBeInTheDocument();
  });
});
