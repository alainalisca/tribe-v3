import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SportsContent from '@/components/site/pages/SportsContent';
import { siteLanguage, siteT, SITE_LANGUAGES } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';
import { SPORT_PAGES, SPORT_WEEK_MAX, sportPage } from '@/lib/site/sportPages';
import { fetchWeekSportCounts, fetchWeekSportRows } from '@/lib/site/week';

/**
 * Page: /deportes/<sport>/ (T-SHARE1 Part B), one per sport Ana shares a card
 * for: boxeo, mma, crossfit, hyrox, yoga, funcional. The Deportes page, opening
 * on the sport's group, with "Esta semana en <deporte>" above it: up to six of
 * this week's sessions in that sport from the live board's cached query, so the
 * card and the page agree. Any other sport is a 404.
 */
type Props = { params: Promise<{ lang: string; sport: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_LANGUAGES.flatMap((lang) => SPORT_PAGES.map((p) => ({ lang, sport: p.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: param, sport } = await params;
  const lang = siteLanguage(param);
  const t = siteT(lang);
  return siteMetadata('sport', `/deportes/${sport}/`, siteCardPath(`deportes/${sport}`, lang), lang, {
    sport: t(`site.og.sport.${sport}.name`),
    inline: t(`site.og.sport.${sport}.inline`),
  });
}

export default async function SportPage({ params }: Props) {
  const { lang: param, sport } = await params;
  const page = sportPage(sport);
  if (!page) notFound();
  const lang = siteLanguage(param);
  const [counts, rows] = await Promise.all([fetchWeekSportCounts(), fetchWeekSportRows(page.sports, SPORT_WEEK_MAX)]);
  const inline = siteT(lang)(`site.og.sport.${sport}.inline`);
  return <SportsContent lang={lang} counts={counts} focus={{ inline, group: page.group, rows }} />;
}
