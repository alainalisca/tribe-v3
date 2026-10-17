import { SPORTS_LIST } from '@/lib/sports';

/**
 * T-SITE1. How many sports the app offers, as the site says it ("22 deportes"):
 * the app's sport list without its catch-all "Other". Derived, never written as
 * a literal in copy, so adding a sport to lib/sports.ts updates every page at
 * the next build (site.test.ts fails on a literal count in the messages).
 */
export const SITE_SPORT_COUNT = SPORTS_LIST.filter((s) => s !== 'Other').length;
