import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from 'next/font/google';

/**
 * T-SITE1. The site's three faces, as CSS variables on the .site frame
 * (components/site/base.module.css reads them). One definition shared by the
 * site's layout and the public coach page (/i/, T-SHARE1 Part E), so both load
 * the same files. "Big Shoulders Display" ships on Google Fonts as "Big
 * Shoulders" with an optical-size axis; opsz 72 (base.module.css .disp) is the
 * Display cut.
 */
// T-SITE1 Part F: Latin only (every Spanish and English character is in it;
// latin-ext was a second 45 KB file preloaded ahead of the hero image).
const display = Big_Shoulders({
  subsets: ['latin'],
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
  subsets: ['latin'],
  variable: '--font-site-body',
  display: 'swap',
  fallback: ['Helvetica Neue', 'Arial', 'sans-serif'],
});

// Small mono labels only: not preloaded, so it never competes with the hero.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  preload: false,
  variable: '--font-site-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'Menlo', 'monospace'],
});

/** The class that puts the three variables on the site frame. */
export const SITE_FONT_CLASS = `${display.variable} ${body.variable} ${mono.variable}`;
