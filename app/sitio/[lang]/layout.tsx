import type { ReactNode } from 'react';
import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import SiteLayout from '@/components/site/SiteLayout';
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
 * The three faces load here and nowhere else, so the app routes never download
 * them. "Big Shoulders Display" ships on Google Fonts as "Big Shoulders" with an
 * optical-size axis; opsz 72 (set in base.module.css .disp) is the Display cut.
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

const display = Big_Shoulders({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  variable: '--font-site-disp',
  display: 'swap',
  fallback: ['Arial Narrow', 'Impact', 'sans-serif'],
  // next/font has no metrics for this family, so it cannot size a fallback
  // and logs an error every build. The headline sits in fixed-height blocks;
  // CLS is measured in Part F.
  adjustFontFallback: false,
});

const body = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-site-body',
  display: 'swap',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-site-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'Menlo', 'monospace'],
});

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
    <SiteLayout lang={lang} lead={lead} fontClassName={`${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </SiteLayout>
  );
}
