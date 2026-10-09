import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * TWO PROPERTIES OF THE MODULE-SCOPE FONT LOADING, BOTH OF WHICH HAVE ALREADY
 * BROKEN, AND NEITHER OF WHICH ANY BEHAVIOUR TEST CAN SEE.
 *
 * ── 1. THE PROMISES MUST HANDLE THEIR OWN REJECTION ──
 *
 * The first version read:
 *
 *     const fontMedium = fetch(new URL('./fonts/...', import.meta.url))
 *       .then((r) => r.arrayBuffer());
 *
 * with a try/catch around the later `await` inside loadFonts. That catch is
 * real and useless here: the promise is created when the MODULE IS IMPORTED,
 * and awaiting it later does not make it handled at the moment it rejects.
 * Outside a Next bundle `import.meta.url` resolves somewhere nothing serves,
 * so importing the route produced three unhandled rejections and CI reported
 *
 *     Test Files  333 passed (333)
 *     Tests       3053 passed | 4 skipped (3057)
 *     Errors      3 errors
 *     Process completed with exit code 1
 *
 * Every test passed. The build was red. Nothing in the output named this file;
 * the only tell was three fonts and three errors.
 *
 * ── 2. THE PATH MUST BE A STRING LITERAL BESIDE `import.meta.url` ──
 *
 * The fix for (1) moved the path into a helper parameter. That typechecked,
 * the whole suite went green, the rejections were gone, and EVERY CARD
 * RETURNED 500: the bundler resolves this construct SYNTACTICALLY, so a
 * variable argument emits no asset, the fetch rejects, and the brand-new
 * `.catch` swallows it — turning a loud failure into a silent one. The error
 * handling added that morning is what hid the regression it caused.
 *
 * ── WHY A SOURCE SCAN ──
 *
 * Both properties are about WHERE text sits, not what a function returns. By
 * the time any test body runs the module is already imported and the rejection
 * has happened or not; and no unit test resolves a bundler asset at all. This
 * is the call-site shape lib/sports.singleSource.test.ts and the
 * StorefrontEditor call-site guard already use in this repo.
 *
 * ── WHAT THIS CANNOT TELL YOU ──
 *
 * That the asset is actually emitted. That is `npm run build` plus the asset
 * list in .next/server/app/api/og/route/middleware-manifest.json, and it is
 * the only instrument that sees property (2) end to end. This guard asserts
 * the textual precondition for it.
 */
const SRC = readFileSync(join(process.cwd(), 'app/api/og/route.tsx'), 'utf8');

/**
 * Strip comments so prose describing the hazard is not mistaken for the
 * hazard. This repo has now paid four times for a check that matched its own
 * explanation — migration 165's counter guard, the T-AUD3 translation guard,
 * the accent arm eating its own exemption list, and 189's header teaching the
 * column extractor about a column named `so`. The block above contains both
 * `fetch(new URL('./fonts/...` and `new URL(path, import.meta.url)` on
 * purpose, either of which would trip an arm below without this.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CODE = stripComments(SRC);
const HELPER = CODE.slice(CODE.indexOf('function selfHandlingFetch'), CODE.indexOf('const fontMedium'));
const WEIGHTS = ['Medium', 'Bold', 'ExtraBold'] as const;

describe('module-scope font loading cannot leak a rejection', () => {
  // Reproduces defect (1) exactly: a bare `fetch(` assigned at module scope.
  // No leading whitespace IS the test for module scope — an indented
  // `const res = await fetch(url)` inside fetchAsDataUri is a DIFFERENT
  // situation and must not be flagged, because nothing creates that promise
  // until a request exists and its caller awaits it inside a try/catch that is
  // therefore attached in time. A first version of this arm called .trim()
  // before matching and flagged that line.
  it('no font fetch is assigned directly at module scope', () => {
    const moduleScopeFetches = CODE.split('\n').filter((line) => /^const\s+\w+\s*=\s*(await\s+)?fetch\(/.test(line));
    expect(moduleScopeFetches).toEqual([]);
  });

  it('the helper attaches a catch chained onto the fetch, not just a then', () => {
    expect(HELPER).toMatch(/\.catch\(/);
    expect(HELPER).toMatch(/make\(\)[\s\S]*?\.catch\(/);
  });

  it('the helper cannot reject: it resolves to null instead', () => {
    expect(HELPER).toMatch(/Promise<ArrayBuffer \| null>/);
    expect(HELPER).toMatch(/\.catch\(\(\)\s*=>\s*null\)/);
  });

  // `new URL(base)` can throw SYNCHRONOUSLY, and a synchronous throw at module
  // scope is worse than an unhandled rejection: it takes the module down and
  // every card with it.
  it('guards the synchronous throw as well as the rejection', () => {
    expect(HELPER).toMatch(/try\s*\{[\s\S]*make\(\)/);
    expect(HELPER).toMatch(/catch\s*\{[\s\S]*Promise\.resolve\(null\)/);
  });
});

describe('the bundler can still see which font file is meant', () => {
  // Reproduces defect (2): the literal must sit beside import.meta.url at the
  // call site. This is the arm that would have caught every card 500ing.
  it.each(WEIGHTS)('%s is requested with a literal path next to import.meta.url', (weight) => {
    expect(CODE).toMatch(
      new RegExp(`fetch\\(new URL\\('\\./fonts/PlusJakartaSans-${weight}\\.ttf', import\\.meta\\.url\\)\\)`)
    );
  });

  it('no new URL is built from a variable', () => {
    // Every new URL against import.meta.url must take a quoted literal.
    const urls = CODE.match(/new URL\([^)]*import\.meta\.url\)/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/new URL\('[^']+',\s*import\.meta\.url\)/);
  });

  it('all three weights go through the self-handling helper', () => {
    for (const weight of WEIGHTS) {
      expect(CODE).toMatch(
        new RegExp(
          `const font\\w+ = selfHandlingFetch\\(\\(\\) => fetch\\(new URL\\('\\./fonts/PlusJakartaSans-${weight}`
        )
      );
    }
  });
});

describe('a font that did not load degrades instead of 500ing', () => {
  // Closes the cheap dishonest fix: passing `data: null` to Satori would
  // satisfy the arms above and throw at render time.
  it('drops a null font rather than handing it to Satori', () => {
    const loader = CODE.slice(CODE.indexOf('async function loadFonts'), CODE.indexOf('async function ogOptions'));
    expect(loader).toMatch(/\.filter\(/);
    expect(loader).toMatch(/!==\s*null/);
  });

  // MEASURED, not inferred: `fonts: []` makes next/og throw
  // "No fonts are loaded. At least one font is required to calculate the
  // layout." — every card, 500, every type. Omitting the key is what actually
  // lets it use its own default face, verified by forcing the empty list and
  // getting HTTP 200 with a 17,488-byte card.
  it('omits the fonts key entirely when none loaded, rather than passing []', () => {
    const opts = CODE.slice(CODE.indexOf('async function ogOptions'), CODE.indexOf('const CARD_ROOT'));
    expect(opts).toMatch(/fonts\.length > 0 \? \{ fonts \} : \{\}/);
    expect(opts).not.toMatch(/fonts:\s*await loadFonts\(\)/);
  });
});
