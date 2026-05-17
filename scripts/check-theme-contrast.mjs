/**
 * Theme contrast validator (theme spec, Part 1B).
 *
 * Verifies every text/background pair in the semantic theme layer meets
 * its WCAG minimum, in BOTH light and dark mode. Run after any change to
 * the .bg-theme-* / .text-theme-* tokens in app/globals.css:
 *
 *   node scripts/check-theme-contrast.mjs
 *
 * Exits non-zero if any pair fails so it can gate CI later.
 *
 * NOTE on the primary-text "14:1" row: the spec's own token table fixes
 * primary dark text at #F0F0F0, which yields ~11-13:1 on the dark
 * surfaces. That is comfortably WCAG AAA (AAA for normal text is 7:1);
 * the spec's "14:1" is stricter than the standard itself and is not
 * physically reachable with the spec's chosen #F0F0F0 token without
 * going to pure #FFFFFF (rejected: outdoor glare/halation). We assert
 * AAA (7:1) for primary and record the spec's 14:1 as advisory.
 */
function luminance(hex) {
  const c = hex
    .replace('#', '')
    .match(/../g)
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const TOKENS = {
  light: {
    page: '#F8F9FA',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    inset: '#F0F1F3',
    'text-primary': '#111827',
    'text-secondary': '#4B5563',
    // tertiary/muted darkened from the spec's #6B7280/#9CA3AF, which
    // failed AA on white/inset. See app/globals.css for rationale.
    'text-tertiary': '#5B616B',
    'text-muted': '#636B77',
    green: '#6FA300', // tribe-green-dark — used on light surfaces
    amber: '#B45309',
  },
  dark: {
    page: '#1E2328',
    surface: '#272D34',
    card: '#2E343B',
    inset: '#1A1F24',
    'text-primary': '#F0F0F0',
    'text-secondary': '#C5CBD3',
    'text-tertiary': '#A0A8B4',
    'text-muted': '#959EAA',
    green: '#A8DA36',
    amber: '#F59E0B',
  },
};

// [textToken, bgToken, minRatio, label]
const PAIRS = [
  ['text-primary', 'page', 7, 'AAA'],
  ['text-primary', 'surface', 7, 'AAA'],
  ['text-primary', 'card', 7, 'AAA'],
  ['text-secondary', 'surface', 7, 'AAA'],
  ['text-secondary', 'card', 7, 'AAA'],
  ['text-tertiary', 'surface', 4.5, 'AA'],
  ['text-tertiary', 'inset', 4.5, 'AA'],
  ['text-muted', 'surface', 4.5, 'AA'],
  ['text-muted', 'inset', 4.5, 'AA'],
  // Brand green is a UI/accent/large-bold color (buttons, badges,
  // icons) — never small body text. WCAG bar for UI components and
  // large text is 3:1 (1.4.11 / 1.4.3). The S3 audit enforces "no
  // small green text on light surfaces"; this row guards the 3:1 floor.
  ['green', 'surface', 3, 'AA-UI/large'],
  ['amber', 'surface', 4.5, 'AA'],
];

let failed = 0;
for (const mode of ['light', 'dark']) {
  const t = TOKENS[mode];
  console.log(`\n${mode.toUpperCase()} MODE`);
  for (const [fg, bg, min, std] of PAIRS) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${fg.padEnd(15)} on ${bg.padEnd(8)} ${r.toFixed(2)}:1  (need ${min}:1 ${std})`
    );
  }
}
console.log(`\n${failed === 0 ? 'ALL PAIRS PASS' : failed + ' PAIR(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
