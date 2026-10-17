import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PLANES_PAGE, planesGuardError } from '@/lib/site/planesGuard';
import type { ReactElement } from 'react';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/site/week', () => ({ fetchWeekBoard: async () => [] }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', setLanguage: vi.fn() }) }));

import SiteLayout from '@/components/site/SiteLayout';
import CoachesPage from './coaches/page';
import GimnasiosPage from './gimnasios/page';
import InicioPage from './page';

/**
 * T-SITE1 Part D, Al's rule (2026-10-17): every plan hook renders only while
 * COACH_PLANS_ENABLED is on, and with it off NO plan content appears anywhere
 * on the site, the ticker and footer included. The WhatsApp sales line is not
 * plan content (Al, 2026-10-17): "Aplica como aliado" on Gimnasios uses it
 * whatever the flag says, and it appears nowhere else with the flag off.
 */
const PLAN_CONTENT = [
  'Coach Pro',
  'Crecimiento',
  'Media Day',
  '/planes',
  'Ver planes',
  'Planes',
  'Pasar a Pro',
  'Precio fundador',
  '89.000',
  '490.000',
  '250.000',
  // Inicio's plan hook. Not "¿Das clases?" alone: that is also the Coaches page title.
  '¿Das clases? Llena tu grupo.',
];

/** Each page inside the site frame (ticker, nav, footer), as HTML, by name. */
async function renderPages(lang: 'es' | 'en') {
  const params = Promise.resolve({ lang });
  const pages: [string, ReactElement][] = [
    ['inicio', await InicioPage({ params })],
    ['coaches', await CoachesPage({ params })],
    ['gimnasios', await GimnasiosPage({ params })],
  ];
  const html: Record<string, string> = {};
  for (const [name, page] of pages) {
    const { container } = render(
      <SiteLayout lang={lang} fontClassName="">
        {page}
      </SiteLayout>
    );
    html[name] = container.innerHTML;
    cleanup();
  }
  return html;
}

async function renderSite(lang: 'es' | 'en') {
  return Object.values(await renderPages(lang)).join('\n');
}

const waLinks = (html: string) => (html.match(/https:\/\/wa\.me\//g) ?? []).length;

afterEach(() => vi.unstubAllEnvs());

describe('plan hooks behind COACH_PLANS_ENABLED (Part D)', () => {
  it.each(['es', 'en'] as const)(
    'flag OFF (%s): no plan content anywhere, ticker and footer included',
    async (lang) => {
      vi.stubEnv('COACH_PLANS_ENABLED', 'false');
      vi.stubEnv('NEXT_PUBLIC_WA_SALES', '3001112233');
      const pages = await renderPages(lang);
      for (const s of PLAN_CONTENT) expect(Object.values(pages).join('\n'), s).not.toContain(s);
      // The one WhatsApp link with the flag off: "Aplica como aliado" on Gimnasios.
      expect(waLinks(pages.gimnasios)).toBe(1);
      expect(waLinks(pages.inicio)).toBe(0);
      expect(waLinks(pages.coaches)).toBe(0);
    }
  );

  it('flag unset behaves as off', async () => {
    vi.stubEnv('COACH_PLANS_ENABLED', '');
    const html = await renderSite('es');
    for (const s of PLAN_CONTENT) expect(html, s).not.toContain(s);
  });

  it('flag ON needs the /planes route: the build refuses the flag until T-PLAN1 brings app/planes/page.tsx', () => {
    const planesExists = existsSync(join(process.cwd(), PLANES_PAGE));
    // Today (before T-PLAN1 merges) the route is missing, so the guard must refuse the flag;
    // once T-PLAN1 is merged the route exists and the flag may go on.
    if (planesExists) expect(planesGuardError('true', true)).toBeNull();
    else expect(planesGuardError('true', false)).toMatch(/Merge T-PLAN1 first/);
    expect(planesGuardError('false', false)).toBeNull();
    expect(planesGuardError(undefined, false)).toBeNull();
  });

  it('flag ON: Inicio hook, Coaches columns, Gimnasios deliverables and prices, ticker, footer', async () => {
    vi.stubEnv('COACH_PLANS_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_WA_SALES', '3001112233');
    const html = await renderSite('es');
    for (const s of [
      '¿Das clases? Llena tu grupo.',
      'Ver planes',
      'Coach Pro',
      '89.000 COP / mes',
      'Pasar a Pro',
      'Tribe Crecimiento',
      '490.000 COP / mes',
      '250.000 COP / hora',
      'Reporte cada viernes',
      'Planes para coaches y gimnasios',
      // next/link drops the trailing slash outside the app's trailingSlash config.
      'href="/planes"',
      'https://wa.me/573001112233',
    ])
      expect(html, s).toContain(s);
  });
});
