import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/** T-JOIN1 Part B: the session page's share metadata and JSON-LD, moved from /s/[id]. */
const row = {
  id: 'f8230509-9aa3-4a79-98e4-afa7b6e695ef',
  title: null,
  sport: 'Boxing',
  date: '2030-10-21',
  start_time: '18:30:00',
  end_time: '19:30:00',
  status: 'active',
  location: 'Cra 43A #1-50, El Poblado, Medellín',
  location_lat: 6.2086,
  location_lng: -75.5659,
  photos: [],
  creator_name: 'Salomon Tabares',
  partner_id: null,
  partner_status: null,
  description: 'Guantes y vendas.',
  price_cents: 0,
  currency: 'COP',
  is_paid: false,
};
// React's cache() exists in the server build only; the test runs the client one.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock('@/lib/og/sessionCard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/og/sessionCard')>()),
  loadSessionForCard: async (id: string) => (id === row.id ? { row, partnerName: null, host: null } : null),
  sessionCardVersion: () => 'v123',
}));

import SessionLayout, { generateMetadata } from './layout';

describe('/session/<id>/ metadata', () => {
  it('title fallback, the card at /session/<id>/card/, og:url on the session page', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ id: row.id }) });
    expect(m.title).toBe('Boxeo con Salomon | Tribe');
    expect(m.openGraph?.url).toMatch(new RegExp(`/session/${row.id}/$`));
    expect(m.openGraph?.images).toEqual([
      expect.objectContaining({
        url: expect.stringMatching(new RegExp(`/session/${row.id}/card/\\?v=v123$`)),
        width: 1200,
        height: 630,
      }),
    ]);
  });

  it('never puts the street address in the description, og tags or JSON-LD', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ id: row.id }) });
    expect(JSON.stringify(m)).not.toContain('Cra 43A');
    expect(m.description).toContain('El Poblado');
    const html = renderToStaticMarkup(await SessionLayout({ params: Promise.resolve({ id: row.id }), children: null }));
    expect(html).toContain('application/ld+json');
    expect(html).not.toContain('Cra 43A');
  });

  it('a session with no partner and no barrio still has Event JSON-LD, placed in Medellín', async () => {
    const saved = { lat: row.location_lat, lng: row.location_lng, location: row.location };
    Object.assign(row, { location_lat: null, location_lng: null, location: null });
    try {
      const html = renderToStaticMarkup(
        await SessionLayout({ params: Promise.resolve({ id: row.id }), children: null })
      );
      expect(html).toContain('application/ld+json');
      expect(html).toContain('Medellín');
    } finally {
      Object.assign(row, { location_lat: saved.lat, location_lng: saved.lng, location: saved.location });
    }
  });

  it('og:description: day · time · barrio · price · "Reserva en Tribe", never the title again', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ id: row.id }) });
    expect(m.description).toMatch(/^\w{3} 21 oct · 18:30 · El Poblado · Gratis · Reserva en Tribe$/);
    expect(m.openGraph?.description).toBe(m.description);
    expect(String(m.description)).not.toContain('Salomon');
  });

  it('a session that is not public gets a neutral title and no JSON-LD', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }) });
    expect(m.title).toBe('Entrenamiento no disponible | Tribe');
    const html = renderToStaticMarkup(
      await SessionLayout({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }), children: null })
    );
    expect(html).not.toContain('ld+json');
  });
});
