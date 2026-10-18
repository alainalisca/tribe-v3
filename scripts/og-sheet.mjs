#!/usr/bin/env node
/* eslint-disable no-console -- a CLI whose output is the report */
/**
 * T-SHARE1 Part D. The contact sheet Al approves before merge: every share
 * card, fetched the way WhatsApp fetches it.
 *
 *   node scripts/og-sheet.mjs                                   # local build on :3006
 *   node scripts/og-sheet.mjs --base https://<preview host>     # a Vercel preview
 *   node scripts/og-sheet.mjs --coaches andres,lissete,<uuid>   # coach links to include
 *   node scripts/og-sheet.mjs --out sheet.png --lang en
 *
 * For each page: GET the page (no cookie, so Spanish, like a scraper), read
 * its og:image, GET that image, and check it is a 1200 x 630 JPEG under 250 KB
 * served straight (no redirect). The image URL is fetched AS NAMED: on a
 * preview it must name the preview's own host (shareImageOrigin); a local
 * build names tribelatam.com, so locally the host is swapped for --base.
 * Prints one line per card and writes the tiled PNG.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const BASE = opt('base', 'http://localhost:3006').replace(/\/+$/, '');
const OUT = opt('out', 'og-sheet.png');
const LANG = opt('lang', 'es');
const COACHES = (opt('coaches', '') || '').split(',').filter(Boolean);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);

const SITE = [
  '/',
  '/para-atletas/',
  '/coaches/',
  '/deportes/boxeo/',
  '/deportes/mma/',
  '/deportes/crossfit/',
  '/deportes/hyrox/',
  '/deportes/yoga/',
  '/deportes/funcional/',
  '/gimnasios/',
  '/tribe-os/',
  '/tv/',
  '/preguntas/',
];
const PAGES = [...SITE, ...COACHES.map((c) => `/i/${c}/`)];
const MAX_BYTES = 250 * 1024;
const headers = { 'User-Agent': 'WhatsApp/2.24 og-sheet', ...(LANG === 'en' ? { Cookie: 'tribe_lang=en' } : {}) };

const results = [];
for (const page of PAGES) {
  const r = { page, problems: [] };
  results.push(r);
  try {
    const res = await fetch(BASE + page, { headers, redirect: 'follow' });
    if (!res.ok) {
      r.problems.push(`page ${res.status}`);
      continue;
    }
    const html = await res.text();
    const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
    if (!og) {
      r.problems.push('no og:image');
      continue;
    }
    r.og = og;
    const imageUrl = LOCAL ? og.replace(/^https:\/\/tribelatam\.com/, BASE) : og;
    if (!LOCAL && !og.startsWith(BASE)) r.problems.push(`og:image is not on ${BASE}: ${og}`);
    const img = await fetch(imageUrl, { headers, redirect: 'manual' });
    if (img.status !== 200) {
      r.problems.push(`image ${img.status}${img.headers.get('location') ? ` -> ${img.headers.get('location')}` : ''}`);
      continue;
    }
    const body = Buffer.from(await img.arrayBuffer());
    const meta = await sharp(body).metadata();
    r.kb = Math.round(body.length / 1024);
    r.body = body;
    if (meta.format !== 'jpeg') r.problems.push(`format ${meta.format}`);
    if (meta.width !== 1200 || meta.height !== 630) r.problems.push(`size ${meta.width}x${meta.height}`);
    if (body.length >= MAX_BYTES) r.problems.push(`${r.kb} KB, over 250`);
  } catch (error) {
    r.problems.push(String(error));
  }
}

for (const r of results) {
  console.log(
    `${r.problems.length ? 'FAIL' : 'OK  '}  ${r.page.padEnd(28)} ${r.kb ?? '-'} KB  ${r.problems.join('; ')}`
  );
}

const CW = 600;
const CH = 315;
const LH = 28;
const G = 14;
const COLS = 2;
const rows = Math.ceil(results.length / COLS);
const W = COLS * CW + (COLS + 1) * G;
const H = 44 + rows * (CH + LH + G) + G;
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (t, w, h, size, y) =>
  Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="${y}" font-family="Menlo, monospace" font-size="${size}" fill="#16191C">${esc(t)}</text></svg>`
  );
const comps = [{ input: text(`T-SHARE1 · every share card from ${BASE} (${LANG})`, W, 44, 17, 30), left: G, top: 0 }];
for (const [i, r] of results.entries()) {
  const left = G + (i % COLS) * (CW + G);
  const top = 44 + G + Math.floor(i / COLS) * (CH + LH + G);
  comps.push({
    input: text(`${r.page}  ·  ${r.problems.length ? r.problems[0] : `${r.kb} KB`}`, CW, LH, 13, 19),
    left,
    top,
  });
  if (r.body) comps.push({ input: await sharp(r.body).resize(CW, CH).png().toBuffer(), left, top: top + LH });
}
await sharp({ create: { width: W, height: H, channels: 3, background: '#F4F3EE' } })
  .composite(comps)
  .png()
  .toFile(OUT);
fs.writeFileSync(
  OUT.replace(/\.png$/, '.json'),
  JSON.stringify(
    results.map(({ body, ...r }) => r),
    null,
    1
  )
);
console.log(`\n${results.filter((r) => !r.problems.length).length} of ${results.length} cards OK. Sheet: ${OUT}`);
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
