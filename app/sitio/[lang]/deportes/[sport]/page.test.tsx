import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WeekRow } from '@/lib/site/weekTypes';

vi.mock('server-only', () => ({}));
const fetchWeekSportRows = vi.fn<(sports: readonly string[], max: number) => Promise<WeekRow[]>>();
vi.mock('@/lib/site/week', () => ({
  fetchWeekSportRows: (sports: readonly string[], max: number) => fetchWeekSportRows(sports, max),
  fetchWeekSportCounts: async () => ({ Boxing: 2 }),
}));

import SportPage, { generateMetadata, generateStaticParams } from './page';

/** T-SHARE1 Part B: /deportes/<sport>/ opens on its group with this week's sessions in that sport. */
function row(i: number): WeekRow {
  return {
    id: `b${i}`,
    seriesId: `b${i}`,
    sport: 'Boxing',
    title: null,
    date: '2026-10-19',
    startTime: '06:00',
    weekdays: [1],
    duration: 60,
    place: 'Zona de Combate',
    price: null,
    spotsLeft: 3,
    creatorId: `c${i}`,
    creatorFirstName: `Coach${i}`,
    creatorName: `Coach${i} T.`,
    creatorAvatarUrl: null,
  };
}

const params = (sport: string, lang = 'es') => ({ params: Promise.resolve({ lang, sport }) });
const hrefOf = (l: Element) => (l.getAttribute('href') ?? '').replace(/\/$/, '');

beforeEach(() => fetchWeekSportRows.mockReset());

describe('/deportes/<sport>/', () => {
  it('prerenders the six sports in both languages, and nothing else', () => {
    expect(generateStaticParams()).toHaveLength(12);
  });

  it("lists this week's sessions in the sport above its group, which opens the page", async () => {
    fetchWeekSportRows.mockResolvedValue([row(1), row(2)]);
    render(await SportPage(params('boxeo')));
    expect(fetchWeekSportRows).toHaveBeenCalledWith(['Boxing'], 6);
    const block = screen.getByRole('heading', { name: 'Esta semana en boxeo' }).parentElement as HTMLElement;
    expect(within(block).getAllByRole('link').map(hrefOf)).toEqual(['/session/b1', '/session/b2']);
    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(groups.slice(0, 2)).toEqual(['Esta semana en boxeo', 'Combate']);
  });

  it('with none this week: the ink block and the link to Coaches', async () => {
    fetchWeekSportRows.mockResolvedValue([]);
    render(await SportPage(params('yoga', 'en')));
    expect(screen.getByText('No yoga sessions this week yet')).toBeTruthy();
    const block = screen.getByRole('heading', { name: 'This week in yoga' }).parentElement as HTMLElement;
    expect(within(block).getAllByRole('link').map(hrefOf)).toEqual(['/coaches']);
  });

  it('an unknown sport is a 404', async () => {
    await expect(SportPage(params('curling'))).rejects.toThrow();
  });

  it('is titled for its sport, at its own public URL, with its own card', async () => {
    const meta = await generateMetadata(params('funcional'));
    expect(meta.title).toBe('Funcional en Medellín · Tribe');
    expect(meta.alternates?.canonical).toBe('https://tribelatam.com/deportes/funcional/');
    expect(meta.openGraph?.images).toEqual([
      {
        url: 'https://tribelatam.com/sitio/es/deportes/funcional/card/',
        alt: 'Funcional en Medellín · Tribe',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
      },
    ]);
  });
});
