import localFont from 'next/font/local';
import stacks from '../fonts/stacks.module.css';

/**
 * T-SITE1. The site's three faces, as CSS variables on the .site frame
 * (components/site/base.module.css reads them). One definition shared by the
 * site's layout and the public coach page (/i/, T-SHARE1 Part E), so both load
 * the same files. "Big Shoulders Display" ships on Google Fonts as "Big
 * Shoulders" with an optical-size axis; opsz 72 (base.module.css .disp) is the
 * Display cut.
 *
 * Self-hosted from lib/fonts/files, like the app's face (lib/fonts/app.ts says
 * why and how): one call per Google @font-face block, joined back into each
 * variable by lib/fonts/stacks.module.css.
 *
 * T-SITE1 Part F: only the latin blocks are preloaded (every Spanish and
 * English character is in them; latin-ext was a second 45 KB file preloaded
 * ahead of the hero image). The other blocks load only if a page needs them.
 * Big Shoulders has no fallback face: next/font had no metrics for it, and the
 * headline sits in fixed-height blocks (CLS is measured in Part F).
 */
const displayLatin = localFont({
  src: '../fonts/files/big-shoulders-latin.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-site-disp-latin',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

const displayLatinExt = localFont({
  src: '../fonts/files/big-shoulders-latin-ext.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-site-disp-latin-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

const displayVietnamese = localFont({
  src: '../fonts/files/big-shoulders-vietnamese.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-site-disp-vietnamese',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    },
  ],
});

const bodyLatin = localFont({
  src: '../fonts/files/instrument-sans-latin.woff2',
  weight: '400 700',
  style: 'normal',
  variable: '--font-site-body-latin',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
    { prop: 'font-stretch', value: '100%' },
  ],
});

const bodyLatinExt = localFont({
  src: '../fonts/files/instrument-sans-latin-ext.woff2',
  weight: '400 700',
  style: 'normal',
  variable: '--font-site-body-latin-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
    { prop: 'font-stretch', value: '100%' },
  ],
});

// Small mono labels only: not preloaded, so it never competes with the hero.
const monoLatin = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-latin.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-latin.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-latin',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

const monoLatinExt = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-latin-ext.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-latin-ext.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-latin-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

const monoVietnamese = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-vietnamese.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-vietnamese.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-vietnamese',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    },
  ],
});

const monoGreek = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-greek.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-greek.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-greek',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'unicode-range', value: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
  ],
});

const monoCyrillic = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-cyrillic.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-cyrillic.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-cyrillic',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' }],
});

const monoCyrillicExt = localFont({
  src: [
    { path: '../fonts/files/jetbrains-mono-cyrillic-ext.woff2', weight: '500' },
    { path: '../fonts/files/jetbrains-mono-cyrillic-ext.woff2', weight: '700' },
  ],
  style: 'normal',
  variable: '--font-site-mono-cyrillic-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
});

/** The classes that put the three variables on the site frame. */
export const SITE_FONT_CLASS = [
  displayLatin.variable,
  displayLatinExt.variable,
  displayVietnamese.variable,
  bodyLatin.variable,
  bodyLatinExt.variable,
  monoLatin.variable,
  monoLatinExt.variable,
  monoVietnamese.variable,
  monoGreek.variable,
  monoCyrillic.variable,
  monoCyrillicExt.variable,
  stacks.site,
].join(' ');
