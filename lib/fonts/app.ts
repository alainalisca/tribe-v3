import localFont from 'next/font/local';
import stacks from './stacks.module.css';

/**
 * Plus Jakarta Sans, the app's face: tailwind's font-sans and font-display read
 * --font-jakarta, set on <html> by app/layout.tsx.
 *
 * Self-hosted. next/font/google downloaded the files at build time, so a
 * failed download from Google failed the build (CI on #249). The files in
 * ./files are the ones Google serves for the same request, byte for byte, and
 * each call below is one of Google's @font-face blocks with its unicode-range,
 * so the browser fetches exactly what it fetched before. How to refresh them:
 * ./files/README.md.
 *
 * One call per block because next/font/local gives every file in a call the
 * same declarations; stacks.module.css joins the blocks back into
 * --font-jakarta, latin first, and adds the fallback face next/font/google
 * generated. Not preloaded, as before.
 */
const jakartaLatin = localFont({
  src: [
    { path: './files/plus-jakarta-sans-latin.woff2', weight: '400' },
    { path: './files/plus-jakarta-sans-latin.woff2', weight: '500' },
    { path: './files/plus-jakarta-sans-latin.woff2', weight: '600' },
    { path: './files/plus-jakarta-sans-latin.woff2', weight: '700' },
    { path: './files/plus-jakarta-sans-latin.woff2', weight: '800' },
  ],
  style: 'normal',
  variable: '--font-jakarta-latin',
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

const jakartaLatinExt = localFont({
  src: [
    { path: './files/plus-jakarta-sans-latin-ext.woff2', weight: '400' },
    { path: './files/plus-jakarta-sans-latin-ext.woff2', weight: '500' },
    { path: './files/plus-jakarta-sans-latin-ext.woff2', weight: '600' },
    { path: './files/plus-jakarta-sans-latin-ext.woff2', weight: '700' },
    { path: './files/plus-jakarta-sans-latin-ext.woff2', weight: '800' },
  ],
  style: 'normal',
  variable: '--font-jakarta-latin-ext',
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

const jakartaVietnamese = localFont({
  src: [
    { path: './files/plus-jakarta-sans-vietnamese.woff2', weight: '400' },
    { path: './files/plus-jakarta-sans-vietnamese.woff2', weight: '500' },
    { path: './files/plus-jakarta-sans-vietnamese.woff2', weight: '600' },
    { path: './files/plus-jakarta-sans-vietnamese.woff2', weight: '700' },
    { path: './files/plus-jakarta-sans-vietnamese.woff2', weight: '800' },
  ],
  style: 'normal',
  variable: '--font-jakarta-vietnamese',
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

const jakartaCyrillicExt = localFont({
  src: [
    { path: './files/plus-jakarta-sans-cyrillic-ext.woff2', weight: '400' },
    { path: './files/plus-jakarta-sans-cyrillic-ext.woff2', weight: '500' },
    { path: './files/plus-jakarta-sans-cyrillic-ext.woff2', weight: '600' },
    { path: './files/plus-jakarta-sans-cyrillic-ext.woff2', weight: '700' },
    { path: './files/plus-jakarta-sans-cyrillic-ext.woff2', weight: '800' },
  ],
  style: 'normal',
  variable: '--font-jakarta-cyrillic-ext',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: 'unicode-range', value: 'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F' },
  ],
});

/** The classes that put --font-jakarta on an element. */
export const APP_FONT_CLASS = [
  jakartaLatin.variable,
  jakartaLatinExt.variable,
  jakartaVietnamese.variable,
  jakartaCyrillicExt.variable,
  stacks.jakarta,
].join(' ');
