import type { ReactNode } from 'react';
import { EPISODES } from '@/lib/site/episodes';
import { coachPlansEnabled } from '@/lib/site/flags';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import MarketingSurfaceMarker from './MarketingSurfaceMarker';
import SiteFooter from './SiteFooter';
import SiteNav from './SiteNav';
import Ticker, { type TickerItem } from './Ticker';
import b from './base.module.css';

/**
 * T-SITE1 Part A. The marketing site's frame: ticker, sticky nav, page, footer.
 *
 * `lead` is the ticker's first two items, which come from the live week board
 * (Part B); without them the ticker keeps its three static items.
 */
export default function SiteLayout({
  children,
  lang,
  fontClassName,
  lead = [],
  afterFooter = null,
}: {
  children: ReactNode;
  lang: SiteLanguage;
  fontClassName: string;
  lead?: TickerItem[];
  /** T-POLISH1 PR 3b-2: what follows the footer inside the frame (the signed-in tab bar on /i). */
  afterFooter?: ReactNode;
}) {
  const t = siteT(lang);
  const plans = coachPlansEnabled();
  const ticker: TickerItem[] = [
    ...lead.slice(0, 2),
    { id: 'tv', tag: t('site.ticker.tvTag'), text: `Tribe.TV · ${EPISODES[0]?.title[lang] ?? ''}` },
    plans
      ? { id: 'plans', tag: t('site.ticker.plansTag'), text: t('site.ticker.plansText') }
      : { id: 'os', tag: t('site.ticker.osTag'), text: t('site.ticker.osText') },
    { id: 'sports', tag: String(SITE_SPORT_COUNT), text: t('site.ticker.sportsText') },
  ];

  return (
    <div className={`${b.site} ${fontClassName}`} lang={lang}>
      <MarketingSurfaceMarker />
      <Ticker items={ticker} />
      <SiteNav lang={lang} />
      <main id="contenido">{children}</main>
      <SiteFooter lang={lang} plansEnabled={plans} />
      {afterFooter}
    </div>
  );
}
