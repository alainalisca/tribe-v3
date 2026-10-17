import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WeekRow } from '@/lib/site/weekTypes';

vi.mock('server-only', () => ({}));
const fetchWeekBoard = vi.fn<() => Promise<WeekRow[]>>();
vi.mock('@/lib/site/week', () => ({ fetchWeekBoard: () => fetchWeekBoard() }));

import InicioPage from './page';

/** T-SITE1 Part B: Inicio renders "La semana" from the live board, whatever its size. */
function row(i: number): WeekRow {
  return {
    id: `s${i}`,
    seriesId: `s${i}`,
    sport: 'Boxing',
    title: null,
    date: '2026-10-19',
    startTime: '06:00',
    weekdays: i === 0 ? [1, 2, 3, 4, 5] : [1],
    duration: 60,
    place: 'El Poblado',
    price: null,
    spotsLeft: 3,
    creatorId: `c${i}`,
    creatorFirstName: `Coach${i}`,
    creatorName: `Coach${i} T.`,
    creatorAvatarUrl: null,
  };
}

/** next/link drops the trailing slash outside the app's trailingSlash config; compare without it. */
const hrefOf = (l: HTMLElement) => (l.getAttribute('href') ?? '').replace(/\/$/, '');

async function renderInicio(lang = 'es') {
  render(await InicioPage({ params: Promise.resolve({ lang }) }));
  const board = document.getElementById('semana') as HTMLElement;
  return { board, links: within(board).getAllByRole('link') };
}

describe('Inicio, "La semana" (T-SITE1 Part B)', () => {
  beforeEach(() => fetchWeekBoard.mockReset());

  it('zero rows: only the "Publica la tuya" row, linking to /coaches/, and no JSON-LD', async () => {
    fetchWeekBoard.mockResolvedValue([]);
    const { board, links } = await renderInicio();
    expect(links).toHaveLength(1);
    expect(hrefOf(links[0])).toBe('/coaches');
    expect(board.querySelector('script[type="application/ld+json"]')).toBeNull();
  });

  it('two rows: both sessions plus "Publica la tuya", titles never blank', async () => {
    fetchWeekBoard.mockResolvedValue([row(0), row(1)]);
    const { board, links } = await renderInicio();
    expect(links.map(hrefOf)).toEqual(['/s/s0', '/s/s1', '/coaches']);
    expect(within(board).getByText('Boxeo con Coach0')).toBeTruthy();
    expect(within(board).getByText('Lun a vie')).toBeTruthy();
    const ld = JSON.parse(board.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
    expect(ld['@type']).toBe('ItemList');
    expect(ld.itemListElement).toHaveLength(2);
  });

  it('each session row is ONE link, named by its visible text (no aria-label, WCAG 2.5.3)', async () => {
    fetchWeekBoard.mockResolvedValue([row(0), { ...row(1), title: 'WOD de los viernes' }]);
    const { board } = await renderInicio();
    const links = within(board).getAllByRole('link', { name: /Pedir cupo/ });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l.hasAttribute('aria-label')).toBe(false);
    expect(within(board).getByRole('link', { name: /Boxeo con Coach0.*Pedir cupo/ })).toBeTruthy();
    expect(within(board).getByRole('link', { name: /WOD de los viernes.*Pedir cupo/ })).toBeTruthy();
    for (const li of board.querySelectorAll('li')) expect(li.querySelectorAll('a, button')).toHaveLength(1);
  });

  it('names the rows in English on the English page', async () => {
    fetchWeekBoard.mockResolvedValue([row(1)]);
    const { board } = await renderInicio('en');
    expect(within(board).getByRole('link', { name: /Boxing with Coach1.*Ask for a spot/ })).toBeTruthy();
  });

  it('gives every image a real alt; only the decorative ones are empty and hidden (Part C)', async () => {
    fetchWeekBoard.mockResolvedValue([row(0)]);
    await renderInicio();
    const imgs = [...document.querySelectorAll('img')];
    expect(imgs.length).toBeGreaterThan(20);
    for (const img of imgs) {
      // The Tribe.OS door's photo sits under the wordmark: decorative, so empty and hidden.
      if (img.getAttribute('aria-hidden') === 'true') expect(img.getAttribute('alt')).toBe('');
      else expect(img.getAttribute('alt'), img.getAttribute('src') ?? '').not.toBe('');
    }
  });

  it('ten rows: eight shown, no "Publica la tuya"', async () => {
    fetchWeekBoard.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row(i)));
    const { links } = await renderInicio();
    expect(links).toHaveLength(8);
    expect(links.every((l) => hrefOf(l).startsWith('/s/'))).toBe(true);
  });

  it('renders in English for /sitio/en', async () => {
    fetchWeekBoard.mockResolvedValue([row(1)]);
    await renderInicio('en');
    expect(screen.getAllByText('Boxing with Coach1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mon').length).toBeGreaterThan(0);
  });
});
