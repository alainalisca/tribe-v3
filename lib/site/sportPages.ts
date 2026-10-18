import type { Sport } from '@/lib/sports';
import { SITE_SPORT_SLUGS, type SiteSportSlug } from './paths';
import { SPORT_GROUPS, type SportGroupKey } from './sportGroups';

/**
 * T-SHARE1 Part B. What each /deportes/<slug>/ page shows: the app sports whose
 * sessions fill its "Esta semana en ..." block, and the Deportes group that
 * opens the page. The app has no MMA or Funcional sport, so:
 *
 * - mma: the combat group without Boxing (Jiu-Jitsu, Muay Thai, Kickboxing),
 *   the same sports Inicio's "Combate" row counts;
 * - funcional: Calisthenics and Weightlifting, the strength group's sports
 *   that CrossFit and HYROX do not cover.
 */
export type SportPage = { slug: SiteSportSlug; sports: Sport[]; group: SportGroupKey };

const groupSports = (key: SportGroupKey): Sport[] => SPORT_GROUPS.find((g) => g.key === key)?.sports ?? [];

const PAGES: Record<SiteSportSlug, Omit<SportPage, 'slug'>> = {
  boxeo: { sports: ['Boxing'], group: 'combat' },
  mma: { sports: groupSports('combat').filter((s) => s !== 'Boxing'), group: 'combat' },
  crossfit: { sports: ['CrossFit'], group: 'strength' },
  hyrox: { sports: ['HYROX'], group: 'strength' },
  yoga: { sports: ['Yoga'], group: 'mind' },
  funcional: { sports: groupSports('strength').filter((s) => s !== 'CrossFit' && s !== 'HYROX'), group: 'strength' },
};

export const SPORT_PAGES: SportPage[] = SITE_SPORT_SLUGS.map((slug) => ({ slug, ...PAGES[slug] }));

export function sportPage(slug: string): SportPage | null {
  return SPORT_PAGES.find((p) => p.slug === slug) ?? null;
}

/** Up to this many sessions in a sport page's week block. */
export const SPORT_WEEK_MAX = 6;
