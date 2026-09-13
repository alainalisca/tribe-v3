/**
 * Is a public share page actually visible to a stranger on a phone?
 *
 * WHY THIS EXISTS, and why it does not name a single component:
 *
 * The previous check asked "is IOSInstallPrompt present" and "is FeedbackWidget
 * present". Both passed. Al then opened /g/bullbox/ on a real iPhone, tapped
 * once, and was walked to the App Store. A verification scoped to the named
 * things passes while the page is still gated by something else -- the same
 * bad-detector trap as matching on innerText instead of the widget's own FAB,
 * one level up.
 *
 * So this asserts the OUTCOME, not the absence of a component:
 *
 *   1. the page does not navigate away on its own
 *   2. the expected <h1> is on screen
 *   3. nothing is painted over it -- elementFromPoint at the h1's centre
 *      resolves to the h1 or one of its descendants
 *   4. no full-viewport element that ACCEPTS POINTER EVENTS is above the
 *      content (a pointer-events:none layer, e.g. the toast container, is fine
 *      and is why 3 and 4 are separate checks)
 *   5. every <a> the page offers is FOLLOWED, cookie-less, on the same mobile
 *      UA, and must land on the href it advertised: same origin, no redirect,
 *      no app-store bounce. An /auth redirect and an App Store bounce are the
 *      same failure with different endpoints -- in both, a stranger taps a
 *      class on a gym's bio link and does not get the class. A link whose href
 *      IS /auth/ passes, because that is a destination the visitor chose
 *      rather than a wall they hit.
 *
 * It waits past the longest timer any gate uses (the install modal's is 3s).
 *
 * Usage:  node scripts/verify-share-routes.mjs <base-url>
 */
import { chromium } from 'playwright';

const BASE = process.argv[2];
if (!BASE) {
  console.error('usage: node scripts/verify-share-routes.mjs <base-url>');
  process.exit(2);
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const GATE_SETTLE_MS = 12000; // install modal fires at 3s; this is well past every timer
const LINK_SETTLE_MS = 4000; // long enough for /download's 300ms store bounce to fire
const EJECTING_PATHS = ['/download']; // pages that auto-navigate to an app store

const CONTEXT = {
  viewport: { width: 390, height: 844 },
  userAgent: IPHONE,
  locale: 'es-CO',
  isMobile: true,
  hasTouch: true,
};

const TARGETS = [
  { path: '/g/bullbox/', h1: 'CrossFit BullBox' },
  { path: '/i/eaff348f-5df3-4df5-bd80-69ec233aad0e/', h1: null }, // /i/ uses an h2
];

function probe() {
  const vw = innerWidth;
  const vh = innerHeight;

  const heading = document.querySelector('h1') || document.querySelector('h2');
  const hb = heading ? heading.getBoundingClientRect() : null;
  const headingVisible = !!hb && hb.width > 0 && hb.height > 0 && hb.top < vh && hb.bottom > 0;

  // Is anything painted over the heading?
  let covering = null;
  if (headingVisible) {
    const hit = document.elementFromPoint(hb.x + hb.width / 2, hb.y + hb.height / 2);
    if (hit && hit !== heading && !heading.contains(hit)) {
      covering = `${hit.tagName}.${String(hit.className).slice(0, 60)}`;
    }
  }

  // Full-viewport layers that would actually intercept a tap.
  const blockers = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'absolute') continue;
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) continue;
    if (s.pointerEvents === 'none') continue; // a non-blocking layer is not a gate
    const b = el.getBoundingClientRect();
    if (b.width >= vw * 0.85 && b.height >= vh * 0.5) {
      blockers.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 60),
        z: s.zIndex,
        text: (el.innerText || '').trim().slice(0, 60).replace(/\n/g, ' | '),
      });
    }
  }

  const links = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
  return { url: location.href, heading: heading && heading.textContent, headingVisible, covering, blockers, links };
}

const browser = await chromium.launch();
let failures = 0;

for (const t of TARGETS) {
  // A fresh context per target: cookie-less, exactly what a stranger gets.
  const ctx = await browser.newContext(CONTEXT);
  const page = await ctx.newPage();
  const trail = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) trail.push(f.url());
  });

  const target = BASE + t.path;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(GATE_SETTLE_MS);
  const r = await page.evaluate(probe);

  const problems = [];
  if (!r.url.startsWith(target)) problems.push(`navigated away to ${r.url}`);
  if (!r.headingVisible) problems.push('the heading is not on screen');
  if (t.h1 && r.heading !== t.h1) problems.push(`heading is ${JSON.stringify(r.heading)}, expected ${JSON.stringify(t.h1)}`);
  if (r.covering) problems.push(`something is painted over the heading: ${r.covering}`);
  for (const b of r.blockers) problems.push(`full-viewport blocker: ${b.tag}.${b.cls} z=${b.z} "${b.text}"`);
  // Every link followed individually. No sampling by "shape": two /s/<id>
  // links can behave differently (a cancelled session, an invite-only one the
  // view excludes), and inferring from the href is the shortcut that hid the
  // CTA bug in the first place.
  const linkResults = [];
  for (const href of [...new Set(r.links)]) {
    if (EJECTING_PATHS.some((p) => href === p || href.startsWith(p + '/'))) {
      problems.push(`link to an app-store bounce: ${href}`);
      linkResults.push({ href, verdict: 'app-store bounce' });
      continue;
    }
    if (!href.startsWith('/')) {
      linkResults.push({ href, verdict: 'external, not followed' });
      continue;
    }
    const lctx = await browser.newContext(CONTEXT);
    const lpage = await lctx.newPage();
    await lpage.goto(BASE + href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await lpage.waitForTimeout(LINK_SETTLE_MS);
    const landed = lpage.url();
    await lctx.close();

    if (!landed.startsWith(BASE)) {
      problems.push(`link left the site: ${href} -> ${landed}`);
      linkResults.push({ href, verdict: `left the browser -> ${landed}` });
    } else if (!landed.startsWith(BASE + href)) {
      // A content link that bounces to /auth is the same failure as one that
      // bounces to the App Store: the visitor does not get what they tapped.
      problems.push(`link redirected: ${href} -> ${landed.replace(BASE, '')}`);
      linkResults.push({ href, verdict: `redirected -> ${landed.replace(BASE, '')}` });
    } else {
      linkResults.push({ href, verdict: 'lands where it says' });
    }
  }

  console.log(`\n${t.path}`);
  console.log(`  heading      : ${JSON.stringify(r.heading)} visible=${r.headingVisible}`);
  console.log(`  navigations  : ${trail.map((u) => u.replace(BASE, '') || '/').join(' -> ')}`);
  console.log(`  links        : ${linkResults.length} followed`);
  linkResults.forEach((l) => console.log(`     ${l.verdict === 'lands where it says' ? 'ok  ' : 'FAIL'} ${l.href} — ${l.verdict}`));
  if (problems.length === 0) {
    console.log('  RESULT       : PASS — the gym is what a visitor sees, nothing over it');
  } else {
    failures += problems.length;
    console.log('  RESULT       : FAIL');
    problems.forEach((p) => console.log(`     ! ${p}`));
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nall share routes clear\n' : `\n${failures} problem(s)\n`);
process.exit(failures === 0 ? 0 : 1);
