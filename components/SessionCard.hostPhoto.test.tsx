import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SessionWithRelations } from '@/lib/dal';

/** T-UI-FD1: feed cards on the host's coach-card photo, never the session's flyers, venue or recap photos. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/city-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/city-config')>()),
  detectNeighborhood: () => null,
  getNearestNeighborhood: () => null,
}));
vi.mock('@/lib/share', () => ({ shareSession: vi.fn() }));
vi.mock('@/components/AvatarStack', () => ({ default: () => null }));
vi.mock('@/components/ShareButton', () => ({ default: () => null }));

import SessionCard from './SessionCard';

const FLYER = 'https://x.supabase.co/storage/v1/object/public/session-photos/flyer.jpg';
const HOST = 'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/photos/salomon.jpg';
const session = {
  id: 's1',
  creator_id: 'h1',
  sport: 'Boxing',
  location: 'Parque Lleras',
  location_lat: null,
  location_lng: null,
  date: '2099-04-25',
  start_time: '18:00',
  duration: 60,
  max_participants: 10,
  current_participants: 3,
  status: 'active',
  price_cents: 0,
  currency: 'COP',
  photos: [FLYER],
  participants: [],
  creator: { id: 'h1', name: 'Salomon', avatar_url: null, cover_image_url: FLYER },
} as unknown as SessionWithRelations;

const heroImgs = (c: HTMLElement) =>
  [...c.querySelectorAll('.aspect-\\[4\\/3\\] img')].map((i) => decodeURIComponent(i.getAttribute('src') ?? ''));

describe('SessionCard host photo (T-UI-FD1)', () => {
  it('shows the host photo, anchored on the card box, and never the flyer or recap photos', () => {
    const { container } = render(
      <SessionCard session={session} recapPhotos={[FLYER]} hostPhoto={{ url: HOST, x: 50, y: 10 }} />
    );
    const imgs = heroImgs(container);
    expect(imgs.some((src) => src.includes('profile-images/photos/salomon.jpg'))).toBe(true);
    expect(imgs.some((src) => src.includes('flyer.jpg'))).toBe(false);
    expect(container.querySelector('.aspect-\\[4\\/3\\] img')?.getAttribute('style')).toContain(
      'object-position: 50% 10%'
    );
  });

  it('a host with no usable photo, or still loading: the sport colours, not the session photo', () => {
    for (const hostPhoto of [null, 'loading' as const]) {
      const { container, unmount } = render(<SessionCard session={session} hostPhoto={hostPhoto} />);
      expect(heroImgs(container)).toEqual([]);
      expect(container.querySelector('.bg-gradient-to-br')).toBeTruthy();
      unmount();
    }
  });

  it('left out (other surfaces): the old carousel, session photo first', () => {
    const { container } = render(<SessionCard session={session} />);
    expect(heroImgs(container).some((src) => src.includes('flyer.jpg'))).toBe(true);
  });

  it('a series card says so, with its days', () => {
    render(<SessionCard session={session} hostPhoto={null} seriesDays="lun · mié · vie" />);
    expect(screen.getByText('Serie · lun · mié · vie')).toBeInTheDocument();
  });
});
