import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { RosterCoach } from '@/lib/site/rosterBuild';
import { ROSTER_HOME_MAX } from '@/lib/site/rosterBuild';
import RosterGrid from './RosterGrid';

/** T-SITE1.1 Part C: the roster with 0, 1, 3 and 14 coaches, on Inicio (capped) and Coaches (all). */
const SPORTS = ['Yoga', 'Boxing', 'CrossFit', 'Pilates', 'Running', 'HYROX', 'Other'];
const PLACES = ['CrossFit BullBox', null, 'Zona de Combate'];

function coaches(n: number): RosterCoach[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Coach${i} V.`,
    initials: `C${i % 10}`,
    // Every third coach has no photo, one has a host next/image would refuse.
    avatarUrl:
      i % 3 === 2
        ? null
        : i === 4
          ? 'https://example.com/a.jpg'
          : `https://x.supabase.co/storage/v1/object/public/a/${i}.jpg`,
    sport: i === 5 ? null : SPORTS[i % SPORTS.length],
    place: PLACES[i % PLACES.length],
    recent: n - i,
    href: `/i/c${i}/`,
  }));
}

describe('RosterGrid', () => {
  it.each([0, 1, 3, 14])('%i coaches on Inicio', (n) => {
    const { container } = render(<RosterGrid lang="es" coaches={coaches(n)} max={ROSTER_HOME_MAX} />);
    expect(container.querySelectorAll('li')).toHaveLength(Math.min(n, ROSTER_HOME_MAX));
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('14 coaches on Coaches: everyone, in English', () => {
    const { container } = render(<RosterGrid lang="en" coaches={coaches(14)} />);
    expect(container.querySelectorAll('li')).toHaveLength(14);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('empty: says how coaches get here and links to Coaches', () => {
    const { container } = render(<RosterGrid lang="es" coaches={[]} />);
    expect(container.textContent).toContain('Los coaches aparecen aquí');
    // next/link drops the trailing slash outside the app's trailingSlash config.
    expect(container.querySelector('a')?.getAttribute('href')).toMatch(/^\/coaches\/?$/);
  });

  it('each card links only to the public coach page; no photo means initials; the sport is the tag', () => {
    const { container } = render(<RosterGrid lang="es" coaches={coaches(6)} />);
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links.every((h) => /^\/i\/c\d+\/?$/.test(h ?? ''))).toBe(true);
    const cards = container.querySelectorAll('li');
    // c2: no avatar; c4: a host next/image cannot load. Both show initials.
    for (const i of [2, 4]) {
      expect(cards[i].querySelector('img')).toBeNull();
      expect(cards[i].textContent).toContain(`C${i}`);
    }
    expect(cards[0].querySelector('img')).not.toBeNull();
    expect(cards[1].textContent).toContain('Boxeo');
    expect(cards[5].textContent).not.toMatch(/Yoga|Boxeo/);
  });

  it("site polish: Andrés shows Al's photo of him, not his avatar", () => {
    const list = coaches(3);
    list[1] = { ...list[1], id: '34d56f30-f8d2-4588-beaa-07ee53d13d1d' };
    const { container } = render(<RosterGrid lang="es" coaches={list} />);
    const img = container.querySelectorAll('li')[1].querySelector('img');
    expect(img?.getAttribute('src')).toContain('coach_andres');
  });

  it('site polish: balances the columns for the count', () => {
    const { container } = render(<RosterGrid lang="es" coaches={coaches(9)} />);
    const ul = container.querySelector('ul') as HTMLElement;
    expect(ul.style.getPropertyValue('--cols')).toBe('5');
    expect(ul.style.getPropertyValue('--cols-md')).toBe('3');
  });
});
