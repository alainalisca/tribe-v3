import type { ReactNode } from 'react';
import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import SiteLayout from '@/components/site/SiteLayout';

/**
 * T-SITE1. The marketing site's route group. The three faces load here and
 * nowhere else, so the app routes never download them.
 *
 * "Big Shoulders Display" now ships on Google Fonts as "Big Shoulders" with an
 * optical-size axis; opsz 72 (set in base.module.css .disp) is the Display cut.
 */
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

export default function SiteGroupLayout({ children }: { children: ReactNode }) {
  return (
    <SiteLayout fontClassName={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</SiteLayout>
  );
}
