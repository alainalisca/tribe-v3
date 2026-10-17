import type { Metadata } from 'next';
import SportsContent from '@/components/site/pages/SportsContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';
import { fetchWeekSportCounts } from '@/lib/site/week';

/**
 * Page: /deportes/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language. The weekly counts come from the live board's cached query.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('deportes', '/deportes/', photo('sp_fuerza'), siteLanguage((await params).lang));
}

export default async function DeportesPage({ params }: Props) {
  const [lang, counts] = [siteLanguage((await params).lang), await fetchWeekSportCounts()];
  return <SportsContent lang={lang} counts={counts} />;
}
