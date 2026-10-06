#!/usr/bin/env node
/**
 * T-AV0 acceptance check 5, first half. Kept in the repo because the merge
 * gate has to run it again, against whatever main looks like that day.
 *
 *   # terminal 1: the branch, flag off
 *   ATHLETE_VALUE_ENABLED=off npm run dev:av
 *   # terminal 2: main at the merge-base, same .env pointed at the same local DB
 *   git clone -b main . /tmp/tribe-main && cd /tmp/tribe-main && npm ci && npx next dev -p 3002
 *   # terminal 3
 *   node scripts/av-snapshot.mjs http://127.0.0.1:3002 /tmp/snap-main.txt
 *   node scripts/av-snapshot.mjs http://127.0.0.1:3001 /tmp/snap-athlete.txt
 *   diff /tmp/snap-main.txt /tmp/snap-athlete.txt      # must be empty
 *
 * BOTH SERVERS MUST POINT AT THE SAME LOCAL DATABASE. Two databases produce a
 * diff full of row-level noise that hides the thing being looked for.
 *
 * AND MAIN NEEDS THE LOCAL-CSP ALLOWANCE TOO, or it cannot sign in and you are
 * comparing a signed-in app against a signed-out one -- which diffs loudly and
 * means nothing. See docs/AV_LOCAL_STACK.md.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2];
const OUT = process.argv[3];
const EMAIL = 'ana@av.local';
const PASSWORD = 'tribe-local-1234';
const SESSION_ID = '00000000-0000-4000-8000-000000001003';

const normalise = (s) =>
  s
    // Relative times ("hace 2 horas", "in 3 days") move while the run happens.
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, '<time>')
    // Any date literal: the seed is relative to today, and the two captures
    // are seconds apart but could straddle midnight.
    .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
    .replace(/\s+/g, ' ')
    .trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const out = [];

async function capture(label, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1200); // client-side data fetches settle
  const text = normalise(await page.evaluate(() => document.body.innerText));
  const nav = await page.evaluate(() =>
    [...document.querySelectorAll('nav a, nav button')]
      .map((el) => `${el.tagName}:${el.getAttribute('href') ?? ''}:${(el.innerText || '').trim()}`)
      .join(' | ')
  );
  out.push(`=== ${label} (${url}) ===\nSTATUS-URL: ${new URL(page.url()).pathname}\nNAV: ${normalise(nav)}\nTEXT: ${text}\n`);
}

// Sign in through the app's own form, not by forging a cookie: the cookie
// format is the auth library's business and a forged one proves nothing about
// whether a real person can get in.
await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle', timeout: 45000 });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 45000 }).catch(() => {});
await page.waitForTimeout(2000);

const signedInAs = await page.evaluate(() => window.location.pathname);
out.push(`SIGN-IN landed on: ${signedInAs}\n`);

await capture('home', '/');
await capture('profile', '/profile/');
await capture('session detail', `/session/${SESSION_ID}/`);
await capture('pase (T-AV gated)', '/pase/');

const { writeFileSync } = await import('node:fs');
writeFileSync(OUT, out.join('\n'));
console.log(`captured ${out.length - 1} surfaces from ${BASE} -> ${OUT}`);

await browser.close();
