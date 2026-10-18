import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));

import SessionPoster, { type PosterSession } from './SessionPoster';

/** T-UI-SD1: the signed-in hero is the host's coach-card photo, never the session's own photos. */
const SESSION_PHOTO = 'https://x.supabase.co/storage/v1/object/public/session-photos/building.jpg';
const HOST_PHOTO = 'https://x.supabase.co/storage/v1/object/public/profile-images/card-photos/salomon.jpg';
const session = {
  id: 's1',
  title: null,
  sport: 'Boxing',
  date: '2030-10-21',
  start_time: '18:30:00',
  photos: [SESSION_PHOTO],
  location: null,
  location_lat: null,
  location_lng: null,
  partner_status: null,
  is_paid: true,
  price_cents: 2500000,
  currency: 'COP',
} as unknown as PosterSession;

const imgSrc = (c: HTMLElement) => decodeURIComponent(c.querySelector('img')?.getAttribute('src') ?? '');

describe('SessionPoster hero photo', () => {
  it('with the host photo: that photo, anchored on the card box', () => {
    const { container } = render(
      <SessionPoster
        session={session}
        creatorName="Salomon"
        gymName={null}
        language="es"
        photo={{ url: HOST_PHOTO, x: 48, y: 12 }}
      />
    );
    expect(imgSrc(container)).toContain('card-photos/salomon.jpg');
    expect(imgSrc(container)).not.toContain('building');
    expect(container.querySelector('img')?.getAttribute('style')).toContain('object-position: 48% 12%');
  });

  it('host has no usable photo: the poster with no photo, not the session photo', () => {
    const { container } = render(
      <SessionPoster session={session} creatorName="Salomon" gymName={null} language="es" photo={null} />
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('left out (the signed-out page, T-SSR1): the session photo as before', () => {
    const { container } = render(
      <SessionPoster session={session} creatorName="Salomon" gymName={null} language="es" />
    );
    expect(imgSrc(container)).toContain('building');
  });

  it('priceTag={false} drops a paid session price from the poster', () => {
    const { container } = render(
      <SessionPoster
        session={session}
        creatorName="Salomon"
        gymName={null}
        language="es"
        photo={null}
        priceTag={false}
      />
    );
    expect(container.textContent).not.toMatch(/25\.000/);
  });
});
