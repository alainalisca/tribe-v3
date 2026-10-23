import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const lang = vi.hoisted(() => ({ current: 'es' as 'es' | 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: lang.current, t: (k: string) => k }) }));
vi.mock('react-leaflet', () => ({ MapContainer: () => null, TileLayer: () => null, Marker: () => null }));
// The component reads L.Icon off the module namespace (named export).
const icon = vi.hoisted(() => ({ Default: { prototype: {}, mergeOptions: () => {} } }));
vi.mock('leaflet', () => ({ Icon: icon, default: { Icon: icon } }));

import LocationMap from './LocationMap';

/**
 * The component imports react-leaflet and leaflet in an effect. A test that
 * ends with those imports still pending lets them resolve after vitest has
 * torn the file down, outside the mocks above, so the REAL react-leaflet
 * loads; it imports React 19's `use`, which React 18 does not export, and
 * vitest reports an unhandled error against whichever file is running (seen
 * in CI on #249). The placeholder pin goes once both imports have landed.
 */
async function mapLoaded(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
}

/** T-UI-SD1: the map button speaks the app's language, in the brand green. */
describe('LocationMap', () => {
  it('says "Cómo llegar" in Spanish and "Get directions" in English', async () => {
    const { container, unmount } = render(<LocationMap latitude={6.2} longitude={-75.56} location="Parque Lleras" />);
    await mapLoaded(container);
    const es = screen.getByRole('button', { name: 'Cómo llegar' });
    expect(es.className).toContain('bg-tribe-green');
    expect(es.className).not.toContain('bg-blue');
    unmount();
    lang.current = 'en';
    const second = render(<LocationMap latitude={6.2} longitude={-75.56} location="Parque Lleras" />);
    expect(screen.getByRole('button', { name: 'Get directions' })).toBeInTheDocument();
    await mapLoaded(second.container);
  });
});
