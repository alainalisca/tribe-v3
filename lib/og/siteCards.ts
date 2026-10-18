import { siteLanguage } from '@/lib/site/i18n';
import { siteMessage, type SiteLanguage } from '@/lib/site/messages';
import { SITE_SPORT_SLUGS, type SiteSportSlug } from '@/lib/site/paths';
import { cardResponse, type CardProps, type Tile } from './card';

/**
 * T-SHARE1 Part B. The share card of every site page, from site.og.* in
 * messages/site/{es,en}.json (Spanish approved by Al, 2026-10-17). Each page's
 * card/route.ts serves one of these; /deportes/ alone keeps its T-SITE1 photo
 * until Al picks one.
 *
 * gimnasios, tribe-os, tv and preguntas have no photo of their own in this
 * ticket: the charcoal card with the page's own title as the headline.
 */
export const SITE_CARD_PAGES = ['home', 'para-atletas', 'coaches', 'gimnasios', 'tribe-os', 'tv', 'preguntas'] as const;
export type SiteCard = (typeof SITE_CARD_PAGES)[number] | `deportes/${SiteSportSlug}`;
export const SITE_CARDS: SiteCard[] = [...SITE_CARD_PAGES, ...SITE_SPORT_SLUGS.map((s) => `deportes/${s}` as const)];

/** Seconds a card is cached before it is drawn again (the copy and photos change by deploy, not by day). */
export const SITE_CARD_REVALIDATE = 86400;

/** Each card page's message group under site.og. */
const OG_KEY: Record<(typeof SITE_CARD_PAGES)[number], string> = {
  home: 'home',
  'para-atletas': 'athletes',
  coaches: 'coaches',
  gimnasios: 'gyms',
  'tribe-os': 'os',
  tv: 'tv',
  preguntas: 'faq',
};

const PHOTO: Partial<Record<(typeof SITE_CARD_PAGES)[number], string>> = {
  'para-atletas': '/og/og_ath.jpg',
  coaches: '/og/og_coach.jpg',
};

/** The why-me cards (athletes, coaches) carry the paper tag; every other card is lime. */
const PAPER: ReadonlySet<SiteCard> = new Set(['para-atletas', 'coaches']);

/** The home card's four tiles: the sport pages with a square tile photo (public/og/og_t_*.jpg), MMA and Funcional aside. */
const HOME_TILES = SITE_SPORT_SLUGS.filter((s) => s !== 'mma' && s !== 'funcional');

export function siteCardProps(card: SiteCard, lang: SiteLanguage): CardProps {
  const m = (ns: string, key: string) => siteMessage(lang, `site.og${ns ? `.${ns}` : ''}`, key);
  const weekly = [m('', 'weekly1'), m('', 'weekly2'), m('', 'weekly3')];

  if (card.startsWith('deportes/')) {
    const slug = card.slice('deportes/'.length);
    const ns = `sport.${slug}`;
    return {
      line: [m(ns, 'line1'), m(ns, 'line2')],
      sub: weekly,
      tag: m(ns, 'name'),
      photo: `/og/og_${slug}.jpg`,
      lang,
    };
  }

  const page = card as (typeof SITE_CARD_PAGES)[number];
  const ns = OG_KEY[page];
  const line: [string, string] = [m(ns, 'line1'), m(ns, 'line2')];
  const tag = m(ns, 'tag');
  if (page === 'home') {
    const tiles = HOME_TILES.map((k) => ({ src: `/og/og_t_${k}.jpg`, label: m('tiles', k) })) as [
      Tile,
      Tile,
      Tile,
      Tile,
    ];
    return { line, sub: weekly, tag, tiles, lang };
  }
  // A page's sub lines are sub1..sub3 where it has them (athletes, coaches, tv).
  const sub = ['sub1', 'sub2', 'sub3'].map((k) => m(ns, k)).filter((s) => !s.startsWith('site.og.'));
  return { line, sub, tag, tagStyle: PAPER.has(page) ? 'paper' : 'lime', photo: PHOTO[page], lang };
}

/** What a card route returns: the card as a JPEG, in the route's language. */
export function siteCardImage(card: SiteCard, lang: string): Promise<Response> {
  return cardResponse(siteCardProps(card, siteLanguage(lang)));
}
