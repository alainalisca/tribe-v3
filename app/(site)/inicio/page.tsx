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
import { siteMetadata } from '@/lib/site/metadata';

/**
 * Page: / for signed-out visitors (T-SITE1 Inicio).
 *
 * Served at `/`: middleware rewrites a cookie-less `/` here, so the URL never
 * shows /inicio and its canonical is `/`. Signed-in visitors keep app/page.tsx,
 * the feed.
 *
 * "La semana" renders its empty state until Part B wires the live board.
 */
export const metadata = siteMetadata('home', '/', '/site/hero_full.jpg');

export default function InicioPage() {
  return (
    <>
      <Hero />
      <Doors />
      <Disciplines />
      <Roster />
      <WeekBoard rows={[]} />
      <Essay />
      <Manifesto />
      <TvBlock />
      <OsBand />
      <Closing />
    </>
  );
}
