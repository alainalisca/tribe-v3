import type { ReactNode } from 'react';
import SiteLayout from '@/components/site/SiteLayout';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { SITE_LANGUAGES, siteLanguage } from '@/lib/site/i18n';
import { fetchWeekBoard } from '@/lib/site/week';
import { tickerLead } from '@/lib/site/weekBoard';

/**
 * T-SITE1. The marketing site, prerendered once per language.
 *
 * Nobody visits /sitio/... : middleware rewrites the public paths (/, /coaches/,
 * /tv/...) here using the tribe_lang cookie and redirects the internal URLs to
 * their public ones (lib/site/paths). So every page is static HTML with its copy
 * already in the visitor's language, and no message file ships to the browser.
 *
 * The three faces (lib/site/fonts.ts) load here and on the public coach page
 * (/i/, T-SHARE1 Part E) and nowhere else, so the app routes never download them.
 */
export const dynamicParams = false;

/**
 * "La semana" (Part B) is live: every site page carries the ticker, whose first
 * two items are the board's two soonest rows, so the whole segment regenerates
 * at most every five minutes (lib/site/week.ts caches the one query).
 */
export const revalidate = 300;

export function generateStaticParams() {
  return SITE_LANGUAGES.map((lang) => ({ lang }));
}

export default async function SiteLangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = siteLanguage((await params).lang);
  const lead = tickerLead(await fetchWeekBoard(), lang);
  return (
    <SiteLayout lang={lang} lead={lead} fontClassName={SITE_FONT_CLASS}>
      {children}
    </SiteLayout>
  );
}
