import type { Metadata } from 'next';
import Closing from '@/components/site/home/Closing';
import Disciplines from '@/components/site/home/Disciplines';
import Doors from '@/components/site/home/Doors';
import Essay from '@/components/site/home/Essay';
import Hero from '@/components/site/home/Hero';
import Manifesto from '@/components/site/home/Manifesto';
import OsBand from '@/components/site/home/OsBand';
import Roster from '@/components/site/home/Roster';
import TvBlock from '@/components/site/home/TvBlock';
import WeekBoard from '@/components/site/WeekBoard';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { fetchWeekBoard } from '@/lib/site/week';

/**
 * Page: / for signed-out visitors (T-SITE1 Inicio).
 *
 * Served at `/`: middleware rewrites a cookie-less `/` here (lib/site/paths),
 * so the URL never shows /sitio and the canonical is `/`. Signed-in visitors
 * keep app/page.tsx, the feed; an expired session is sent back here.
 *
 * "La semana" is the live board (Part B, lib/site/week.ts): one cached query,
 * shared with the layout's ticker; the segment revalidates every five minutes.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('home', '/', '/site/hero_full.jpg', siteLanguage((await params).lang));
}

export default async function InicioPage({ params }: Props) {
  const lang = siteLanguage((await params).lang);
  const week = await fetchWeekBoard();
  return (
    <>
      <Hero lang={lang} />
      <Doors lang={lang} />
      <Disciplines lang={lang} />
      <Roster lang={lang} />
      <WeekBoard lang={lang} rows={week} />
      <Essay lang={lang} />
      <Manifesto lang={lang} />
      <TvBlock lang={lang} />
      <OsBand lang={lang} />
      <Closing lang={lang} />
    </>
  );
}
