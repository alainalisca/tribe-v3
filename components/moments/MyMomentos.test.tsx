import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import MyMomentos from './MyMomentos';
import type { MyMomentsApi } from '@/lib/moments/myApi';
import type { MyMomentsBatch } from '@/lib/moments/types';

/**
 * T-MOM1 Part C: Momentos and its viewer. The deep link opens the right
 * session's batch; Gracias marks the photo; "Pedir que la borren" removes it
 * from the screen. The API is a stand-in.
 */
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const photo = (id: string) => ({
  mediaId: id,
  gridUrl: `https://s/${id}.400.webp`,
  viewerUrl: `https://s/${id}.1200.webp`,
  width: 10,
  height: 10,
  thanked: false,
});
const batches: MyMomentsBatch[] = [
  { sessionId: S2, title: 'Yoga al parque', sport: 'Yoga', date: '2026-10-14', coachName: 'Valentina', photos: [photo('y1')] },
  {
    sessionId: S1,
    title: null,
    sport: 'Boxing',
    date: '2026-10-07',
    coachName: 'Salomon Tabares',
    photos: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'].map(photo),
  },
];

function api(): MyMomentsApi {
  return {
    load: vi.fn(),
    download: vi.fn(async () => 'https://s/original'),
    thanks: vi.fn(async () => undefined),
    remove: vi.fn(async () => ({ requested: true })),
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Momentos (T-MOM1 Part C)', () => {
  it('one poster per session, newest first, with the coach, the date and "N fotos"; six photos until "Ver las N"', () => {
    render(<MyMomentos initial={batches} api={api()} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Yoga al parque', 'Boxeo']);
    const boxing = screen.getByRole('region', { name: 'Boxeo' });
    expect(within(boxing).getByText('8 fotos')).toBeTruthy();
    expect(within(boxing).getByText(/^Salomon · /)).toBeTruthy();
    expect(within(boxing).getAllByRole('button', { name: /^Foto \d de 8$/ })).toHaveLength(6);
    fireEvent.click(within(boxing).getByRole('button', { name: 'Ver las 8' }));
    expect(within(boxing).getAllByRole('button', { name: /^Foto \d de 8$/ })).toHaveLength(8);
  });

  it('the deep link (?s=) opens that batch and scrolls to it', () => {
    render(<MyMomentos initial={batches} api={api()} openSessionId={S1} />);
    const boxing = screen.getByRole('region', { name: 'Boxeo' });
    expect(within(boxing).getAllByRole('button', { name: /^Foto \d de 8$/ })).toHaveLength(8);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.getElementById(`momentos-${S1}`)).toBe(boxing);
  });

  it('the viewer: Gracias marks the photo; Pedir que la borren removes it from Momentos', async () => {
    const a = api();
    render(<MyMomentos initial={batches} api={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Foto 1 de 1' }));
    const viewer = await screen.findByTestId('moment-viewer');
    expect(within(viewer).getByText('Compartir')).toBeTruthy();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Gracias' }));
    await waitFor(() => expect(a.thanks).toHaveBeenCalledWith('y1'));
    expect(within(viewer).getByRole('button', { name: 'Gracias enviadas' })).toBeTruthy();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Quitarme' }));
    fireEvent.click(within(screen.getByTestId('remove-sheet')).getByRole('button', { name: 'Pedir que la borren' }));
    await waitFor(() => expect(a.remove).toHaveBeenCalledWith('y1', true));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Yoga al parque' })).toBeNull());
    expect(screen.queryByTestId('moment-viewer')).toBeNull();
  });

  it('empty: says where photos will come from', () => {
    render(<MyMomentos initial={[]} api={api()} />);
    expect(screen.getByText(/Cuando un coach te etiquete/)).toBeTruthy();
  });
});
