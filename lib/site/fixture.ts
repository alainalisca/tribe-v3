import type { Fixture, FixtureLabels } from '@/components/site/FixtureRow';
import { translateSport } from '@/lib/sportTranslationData';
import { siteT, type SiteLanguage } from './i18n';
import { daysLabel, rowTitle } from './weekBoard';
import { formatPrice } from './weekFormat';
import type { WeekRow } from './weekTypes';

/**
 * T-JOIN1 Part A. A board row (WeekRow) worded as a FixtureRow, in the page's
 * language, on the server: the site's board, sport pages and coach page call
 * this, and FixtureRow itself stays free of site copy so the app can use it.
 * The words are the ones the row printed before: daysLabel, rowTitle (the
 * title, or "<Deporte> con <Nombre>"), formatPrice.
 */
export function fixtureFromWeekRow(r: WeekRow, lang: SiteLanguage, opts: { days?: string } = {}): Fixture {
  const sport = translateSport(r.sport, lang);
  return {
    id: r.id,
    href: `/session/${r.id}/`,
    days: opts.days ?? daysLabel(r.weekdays, lang),
    time: r.startTime,
    sport: r.sport && r.sport !== 'Other' ? sport : null,
    title: rowTitle(r, lang),
    detail: `${r.title && sport ? `${sport} · ` : ''}${r.duration} min${r.price ? ` · ${formatPrice(r.price, lang)}` : ''}`,
    place: r.place,
    coach: r.creatorName,
    price: r.price === null ? 'free' : formatPrice(r.price, lang),
    spots: r.spotsLeft,
  };
}

/** The row's words in the page language; `action` replaces "Pedir cupo" (the coach page's "Reserva"). */
export function fixtureLabels(lang: SiteLanguage, action?: string): FixtureLabels {
  const t = siteT(lang);
  return {
    free: t('site.week.free'),
    spots: t('site.week.spots', { n: '{n}' }),
    spotsOne: t('site.week.spotsOne'),
    action: action ?? t('site.week.ask'),
  };
}
