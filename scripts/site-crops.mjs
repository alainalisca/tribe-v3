#!/usr/bin/env node
/**
 * T-SITE1.1 Part B. The marketing site's photo pass, reproducible.
 *
 *   node scripts/site-crops.mjs "<path to Homepage Photos/_mock/crops/jobs.json>" [key ...]
 *
 * jobs.json holds `driveRoot` (the camera originals), `banned` (frames that
 * must never be used) and `jobs`. Each job names a camera original under the
 * drive root, the site key, the crop aspect, the output width and where the
 * faces are in the original (`face`, percent) or, for a photo without people,
 * the point to centre on (`focus`). `place` is where that point should sit in
 * the crop (fractions, default 0.5, 0.4) and `zoom` shrinks the largest crop of
 * that aspect (default 1). The script computes the crop box and the face point
 * inside the crop, writes both back into the job (`crop`, `anchor`), and saves
 * public/<out>.jpg and .webp: orientation applied, EXIF stripped, quality 82.
 *
 * T-SHARE1 Part A adds `cards`: the share card photos. Each names a camera
 * original, a box as fractions of the oriented frame (x0, y0, x1, y1) and an
 * output `size`. The box is made taller (or wider) around its centre until its
 * ratio is exactly the output's, so the resize never stretches; the pixel box
 * is written back (`crop`). Output: public/og/<key>.jpg, JPG only, orientation
 * applied, EXIF stripped, quality 82. `cards` as the only key runs just these;
 * `--check` checks them without touching the drive (Part D).
 *
 * A banned source stops the run before anything is read: Al's rule, a person
 * who asked not to appear in Tribe media, and frames that are not Al's.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [jobsPath, ...only] = process.argv.slice(2);
if (!jobsPath) {
  console.error('usage: node scripts/site-crops.mjs <jobs.json> [key ...]');
  process.exit(2);
}
const file = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const PUBLIC = path.join(process.cwd(), 'public');

/** A banned entry is an exact relative path, a folder ("dir/"), or "*text*" anywhere in the path. */
function bannedBy(source, banned) {
  const s = source.replace(/\\/g, '/').toLowerCase();
  return banned.find((b) => {
    const e = b.toLowerCase();
    if (e.startsWith('*') && e.endsWith('*')) return s.includes(e.slice(1, -1));
    if (e.endsWith('/')) return s.startsWith(e) || s.includes(`/${e}`);
    return s === e || s.endsWith(`/${e}`);
  });
}

const cards = file.cards ?? [];
const refused = [...file.jobs, ...cards]
  .map((j) => [j.key, j.source, bannedBy(j.source, file.banned)])
  .filter(([, , b]) => b);
if (refused.length) {
  for (const [key, source, rule] of refused) console.error(`REFUSED ${key}: ${source} is banned (${rule})`);
  process.exit(1);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// T-SHARE1 Part D: `--check` reads nothing from the drive and writes nothing.
// For every card it asserts the recorded crop sits inside its source frame at
// exactly the output's shape, and that public/og/<key>.jpg exists at that size.
if (only[0] === '--check') {
  const bad = [];
  for (const card of cards) {
    const c = card.crop;
    const [outW, outH] = card.size;
    const out = path.join(PUBLIC, 'og', `${card.key}.jpg`);
    if (!c) {
      bad.push(`${card.key}: no crop recorded; run the script for it`);
      continue;
    }
    const [W, H] = c.of;
    if (c.left < 0 || c.top < 0 || c.left + c.width > W || c.top + c.height > H)
      bad.push(`${card.key}: crop ${c.left},${c.top} ${c.width}x${c.height} leaves the ${W}x${H} frame`);
    if (Math.abs(c.width / c.height / (outW / outH) - 1) > 0.002)
      bad.push(`${card.key}: crop ratio ${(c.width / c.height).toFixed(4)} is not ${(outW / outH).toFixed(4)}`);
    if (!fs.existsSync(out)) bad.push(`${card.key}: ${path.relative(process.cwd(), out)} is missing`);
    else {
      const m = await sharp(out).metadata();
      if (m.width !== outW || m.height !== outH)
        bad.push(`${card.key}: file is ${m.width}x${m.height}, declared ${outW}x${outH}`);
    }
  }
  for (const b of bad) console.error(`FAIL ${b}`);
  console.log(`${cards.length - new Set(bad.map((b) => b.split(':')[0])).size} of ${cards.length} card crops OK`);
  process.exit(bad.length ? 1 : 0);
}

const cardsOnly = only.length === 1 && only[0] === 'cards';
const wanted = (key) => !only.length || only.includes(key);

/** Oriented width and height of a camera original. */
async function orientedSize(src) {
  const meta = await sharp(src).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  return turned ? [meta.height, meta.width] : [meta.width, meta.height];
}

for (const job of file.jobs) {
  if (cardsOnly || !wanted(job.key)) continue;
  const src = path.join(file.driveRoot, job.source);
  const meta = await sharp(src).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const W = turned ? meta.height : meta.width;
  const H = turned ? meta.width : meta.height;

  // The largest crop of this aspect, shrunk by zoom.
  const zoom = job.zoom ?? 1;
  let w = W / H > job.aspect ? H * job.aspect : W;
  let h = w / job.aspect;
  w = Math.round(w * zoom);
  h = Math.round(h * zoom);

  // Put the face (or focus) point at `place` inside the crop, then keep the crop inside the frame.
  const [fx, fy] = job.face ?? job.focus ?? [50, 50];
  const [px, py] = job.place ?? [0.5, 0.4];
  const left = Math.round(clamp((fx / 100) * W - px * w, 0, W - w));
  const top = Math.round(clamp((fy / 100) * H - py * h, 0, H - h));
  job.crop = { left, top, width: w, height: h, of: [W, H] };
  job.anchor = job.face
    ? [Math.round((((fx / 100) * W - left) / w) * 100), Math.round((((fy / 100) * H - top) / h) * 100)]
    : null;

  const outW = Math.min(job.w, w);
  const outH = Math.round(outW / job.aspect);
  let img = sharp(src).rotate().extract({ left, top, width: w, height: h }).resize(outW, outH);
  if (job.brightness) img = img.modulate({ brightness: job.brightness });
  const out = path.join(PUBLIC, job.out ?? `site/${job.key}.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = await img.toBuffer();
  await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  await sharp(buf)
    .webp({ quality: 82 })
    .toFile(out.replace(/\.jpe?g$/i, '.webp'));
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(
    `${job.key.padEnd(12)} ${outW}x${outH} ${kb} KB  crop ${left},${top} ${w}x${h} of ${W}x${H}  anchor ${job.anchor ?? '-'}`
  );
}

/**
 * A fractional box in pixels, grown around its centre to exactly `ratio`
 * (width / height) and kept inside the frame. Grows, never shrinks, unless the
 * frame itself is too small in that direction.
 */
function snapBox([x0, y0, x1, y1], [W, H], ratio) {
  let w = (x1 - x0) * W;
  let h = (y1 - y0) * H;
  const cx = ((x0 + x1) / 2) * W;
  const cy = ((y0 + y1) / 2) * H;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  if (h > H) [w, h] = [H * ratio, H];
  if (w > W) [w, h] = [W, W / ratio];
  w = Math.round(w);
  h = Math.round(h);
  const left = Math.round(clamp(cx - w / 2, 0, W - w));
  const top = Math.round(clamp(cy - h / 2, 0, H - h));
  return { left, top, width: w, height: h, of: [W, H] };
}

for (const card of cards) {
  if (!cardsOnly && !wanted(card.key)) continue;
  const src = path.join(file.driveRoot, card.source);
  const [outW, outH] = card.size;
  card.crop = snapBox(card.box, await orientedSize(src), outW / outH);
  const { left, top, width, height } = card.crop;
  const out = path.join(PUBLIC, 'og', `${card.key}.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(src)
    .rotate()
    .extract({ left, top, width, height })
    .resize(outW, outH)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(out);
  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(
    `${card.key.padEnd(14)} ${outW}x${outH} ${kb} KB  crop ${left},${top} ${width}x${height} of ${card.crop.of.join('x')}`
  );
}

fs.writeFileSync(jobsPath, `${JSON.stringify(file, null, 2)}\n`);
