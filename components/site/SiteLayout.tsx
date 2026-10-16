import type { ReactNode } from 'react';
import { coachPlansEnabled } from '@/lib/site/flags';
import LatestEpisodeTitle from './LatestEpisodeTitle';
import MarketingSurfaceMarker from './MarketingSurfaceMarker';
import SiteFooter from './SiteFooter';
import SiteNav from './SiteNav';
import { T } from './T';
import Ticker, { type TickerItem } from './Ticker';
import b from './base.module.css';

/**
 * T-SITE1 Part A. The marketing site's frame: ticker, sticky nav, page, footer.
 * Replaces components/marketing/MarketingLayout for the (site) routes.
 *
 * `lead` is the ticker's first two items, which come from the live week board
 * (Part B); a page without the board passes none and the ticker keeps its three
 * static items.
 */
export default function SiteLayout({
  children,
  fontClassName,
  lead = [],
}: {
  children: ReactNode;
  fontClassName: string;
  lead?: TickerItem[];
}) {
  const plans = coachPlansEnabled();
  const ticker: TickerItem[] = [
    ...lead.slice(0, 2),
    {
      id: 'tv',
      tag: <T k="site.ticker.tvTag" />,
      text: (
        <>
          Tribe.TV · <LatestEpisodeTitle />
        </>
      ),
    },
    plans
      ? { id: 'plans', tag: <T k="site.ticker.plansTag" />, text: <T k="site.ticker.plansText" /> }
      : { id: 'os', tag: <T k="site.ticker.osTag" />, text: <T k="site.ticker.osText" /> },
    { id: 'sports', tag: '22', text: <T k="site.ticker.sportsText" /> },
  ];

  return (
    <div className={`${b.site} ${fontClassName}`}>
      <MarketingSurfaceMarker />
      <Ticker items={ticker} />
      <SiteNav />
      <main id="contenido">{children}</main>
      <SiteFooter plansEnabled={plans} />
    </div>
  );
}
