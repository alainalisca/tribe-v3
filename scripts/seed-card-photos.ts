/* eslint-disable no-console -- a CLI whose output is the report */
/**
 * T-SHARE1 Part C. Seeds the share-card photo of the coaches Al audited on
 * 2026-10-17 (mock: https://claude.ai/artifact/KzKuUqzPFg1NAZBVPU15J9).
 *
 *   npx tsx scripts/seed-card-photos.ts                 # dry run: prints what it would set, writes nothing
 *   npx tsx scripts/seed-card-photos.ts --plan out.json # dry run, and the plan as JSON (the contact sheet reads it)
 *   npx tsx scripts/seed-card-photos.ts --apply         # ONLY with Al's go, and only after migration 220
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local. The audit's files are read from COACH_MEDIA
 * (Al's Diceus folder) and, for Alexandra, the camera original.
 *
 * HOW A PICK BECOMES A URL. The audit downloaded every coach's avatar, cover,
 * gallery and session photos and Al picked from those files; the file names do
 * not record where each came from, and the files were re-encoded on the way
 * (measured: different bytes, and some at a smaller size). So the dry run
 * downloads the coach's current images again and matches the pick by its
 * pixels: the same shape (aspect within 1%), and a 32 x 32 grey thumbnail within MATCH_LIMIT grey
 * levels on average, the closest one winning. Never a guess from the file
 * name. A pick that matches nothing stops the coach's line with NO MATCH.
 *
 * THE BOXES are where the mock's own crop (p_<coach>.jpg, 700 x 630) sits in
 * the picked photo, located by searching for it (error 1.4 to 7 grey levels on
 * 255, every one). Venom's is the crop Al gave in pixels (0, 40, 1080, 1017).
 *
 * WHAT --apply DOES, per coach and in this order: upload the photo to storage
 * when it is not there yet (Alexandra's frame, Venom's Instagram photo,
 * Marcela's cover from her own site), then set card_photo_url and
 * card_photo_box, or for Caroline card_photo_rejects. Nobody else is touched.
 * It never deletes anything.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { CardBox } from '../lib/og/cardCrop';

const COACH_MEDIA = '/Users/alainalisca/Desktop/Tribe - Diceus Code/_site_photo_pass/coach_media';
const BUCKET = 'profile-images';

type Seed =
  /** One of the coach's own images in the database, found by the pick's bytes. */
  | { kind: 'match'; file: string; box: CardBox; note: string }
  /** A file to upload to storage first (not in the database, or hotlinked). */
  | { kind: 'upload'; file: string; box: CardBox; note: string }
  /** The coach's own image on another site: matched by bytes, then copied into storage. */
  | { kind: 'copy'; file: string; box: CardBox; note: string }
  /**
   * Every image of the coach goes into card_photo_rejects. For Caroline (stock
   * photos), and for Karen and Juan: Al wants the no-photo card for both, and
   * with nothing set the card's rule (b) would show their covers (a lily pad;
   * a group photo). Rejects is the only way to get there; nothing else is set.
   */
  | { kind: 'reject-all'; note: string }
  /** Nothing is set. */
  | { kind: 'none'; note: string };

/** Coaches by the start of their account id (measured 2026-10-17); first name only for the report. */
export const SEEDS: { id: string; first: string; seed: Seed }[] = [
  {
    id: '307cf7fa',
    first: 'Salomón',
    seed: {
      kind: 'match',
      file: '_pick/salomon_02_photo.jpg',
      box: { x0: 0.13, y0: 0, x1: 0.87, y1: 1 },
      note: 'his cage-fight gallery photo',
    },
  },
  {
    id: '0df617e9',
    first: 'Leo',
    seed: {
      kind: 'match',
      file: '_pick/leo_09_session.jpg',
      box: { x0: 0.13, y0: 0, x1: 0.87, y1: 1 },
      note: 'the BullBox community photo from his own sessions',
    },
  },
  {
    id: '34d56f30',
    first: 'Andrés',
    seed: {
      kind: 'match',
      file: '_pick/andres_03_photo.jpg',
      box: { x0: 0.0033, y0: 0.0496, x1: 0.9967, y1: 0.7493 },
      note: 'his kettlebell gallery photo',
    },
  },
  {
    id: 'a9ced6e2',
    first: 'Neera',
    seed: {
      kind: 'match',
      file: 'neera_02_photo.jpg',
      box: { x0: 0.0067, y0: 0.1107, x1: 0.9933, y1: 0.6098 },
      note: "her sunset portrait (4032 px), the mock's source; _pick held a session flyer",
    },
  },
  {
    id: 'a8bea932',
    first: 'Marcela',
    seed: {
      kind: 'copy',
      file: '_pick/marcela_01_cover.jpg',
      box: { x0: 0.24, y0: 0.006, x1: 0.86, y1: 1 },
      note: 'her cover, the park class; it lives on marceanahata.com, so it is copied into storage',
    },
  },
  {
    id: '63fd065f',
    first: 'Lissete',
    seed: {
      kind: 'match',
      file: '_pick/lissete_00_avatar.jpg',
      box: { x0: 0, y0: 0, x1: 1, y1: 0.9 },
      note: 'her avatar, the camel pose',
    },
  },
  {
    id: '36c051dd',
    first: 'Santiago',
    seed: {
      kind: 'match',
      file: '_pick/santiago_01_cover.jpg',
      box: { x0: 0.13, y0: 0, x1: 0.87, y1: 1 },
      note: 'his cover, rolling on the mat',
    },
  },
  {
    id: '2084307b',
    first: 'Jonathan',
    seed: {
      kind: 'match',
      file: '_pick/jonathan_03_photo.jpg',
      box: { x0: 0, y0: 0.05, x1: 1, y1: 0.95 },
      note: 'his overhead squat',
    },
  },
  {
    id: '90de7550',
    first: 'Melissa',
    seed: {
      kind: 'match',
      file: '_pick/melissa_03_photo.jpg',
      box: { x0: 0, y0: 0.0249, x1: 1, y1: 0.7729 },
      note: 'her swim portrait',
    },
  },
  {
    id: 'c0a4d4e0',
    first: 'Ronald',
    seed: {
      kind: 'match',
      file: 'ronald_08_photo.jpg',
      box: { x0: 0, y0: 0.1, x1: 1, y1: 0.7 },
      note: 'the tournament photo in his black gi (1066 x 1600), not the team photo',
    },
  },
  {
    id: '9a16aa6b',
    first: 'Alexandra',
    seed: {
      kind: 'upload',
      file: '/Volumes/Tribe Videos/Media Archive/Alex - Yoga - 9.18.2026/IMG_8942.JPG',
      box: { x0: 0, y0: 0.2, x1: 1, y1: 0.8 },
      note: "Al's terrace frame IMG_8942",
    },
  },
  {
    id: '6f873344',
    first: 'Venom',
    seed: {
      kind: 'upload',
      file: 'venom_ig_muscleup.jpg',
      // Al's crop in pixels on the 1080 x 1080 file: (0, 40, 1080, 1017).
      box: { x0: 0, y0: 40 / 1080, x1: 1, y1: 1017 / 1080 },
      note: 'his Instagram photo, the muscle-up (Al approved, 2026-10-17)',
    },
  },
  {
    id: '1848555a',
    first: 'Caroline',
    seed: { kind: 'reject-all', note: 'her avatar has an Unsplash watermark and her gallery looks like stock' },
  },
  {
    id: 'd98efbb2',
    first: 'Karen',
    seed: {
      kind: 'reject-all',
      note: 'no-photo card (Al): her avatar is 600 px and her cover is a lily pad, not her; no photo is set',
    },
  },
  {
    id: '32100040',
    first: 'Juan',
    seed: {
      kind: 'reject-all',
      note: 'athlete, on hold (Al): no photo is set; rejects only, so the card is the no-photo one Al asked for',
    },
  },
  { id: '03422f4e', first: 'Alejandro', seed: { kind: 'none', note: 'no photo, no sport, no classes' } },
];

/** Jeisson has no account under that spelling; the dry run looks for him by name and says what it found. */
const JEISSON = /^j[ey]i?s+on\b/i;

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const file = path.resolve(__dirname, '..', '.env.local');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line)
      return line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  throw new Error(`${name} is not set`);
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Average grey-level difference two thumbnails may have and still be one photo. */
const MATCH_LIMIT = 6;

/** A photo's oriented size and a 32 x 32 grey thumbnail, to recognise it after re-encoding. */
async function fingerprint(b: Buffer): Promise<{ w: number; h: number; px: Buffer } | null> {
  try {
    const meta = await sharp(b).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const px = await sharp(b).rotate().resize(32, 32, { fit: 'fill' }).greyscale().raw().toBuffer();
    return { w: turned ? meta.height! : meta.width!, h: turned ? meta.width! : meta.height!, px };
  } catch {
    return null;
  }
}

function difference(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}
const short = (u: string) => u.replace(/^https?:\/\/[^/]+/, '').slice(-60);

async function download(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

type CoachRow = {
  id: string;
  name: string | null;
  sports: string[] | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  photos: string[] | null;
};

/** Every image of a coach, labelled by where it lives. */
async function imagesOf(supabase: SupabaseClient, c: CoachRow): Promise<{ label: string; url: string }[]> {
  const out: { label: string; url: string }[] = [];
  if (c.avatar_url) out.push({ label: 'avatar_url', url: c.avatar_url });
  if (c.cover_image_url) out.push({ label: 'cover_image_url', url: c.cover_image_url });
  (c.photos ?? []).forEach((url, i) => url && out.push({ label: `photos[${i}]`, url }));
  const { data } = await supabase.from('sessions').select('id, photos').eq('creator_id', c.id).limit(500);
  for (const s of (data ?? []) as { id: string; photos: string[] | null }[]) {
    (s.photos ?? []).forEach((url, i) => url && out.push({ label: `session ${s.id.slice(0, 8)} photos[${i}]`, url }));
  }
  return [...new Map(out.map((o) => [o.url, o])).values()];
}

export type PlanEntry = {
  id: string;
  first: string;
  kind: Seed['kind'];
  note: string;
  set: { card_photo_url?: string; card_photo_box?: CardBox; card_photo_rejects?: string[] };
  /** For the contact sheet: the local bytes the card would be cut from. */
  sourceFile?: string;
  /** --apply: where the file goes first. */
  upload?: { path: string; file?: string; from?: string };
  problem?: string;
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const planOut = args.includes('--plan') ? args[args.indexOf('--plan') + 1] : null;
  const base = env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const supabase = createClient(base, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const publicUrl = (p: string) => `${base}/storage/v1/object/public/${BUCKET}/${p}`;

  if (apply) {
    // Refuse before 220: the columns would not exist and the update would fail part way.
    const { error } = await supabase.from('users').select('card_photo_url').limit(1);
    if (error) throw new Error(`migration 220 is not applied (${error.code}); nothing written`);
  }

  const { data: rows, error } = await supabase
    .from('users')
    .select('id, name, sports, avatar_url, cover_image_url, photos')
    .eq('is_instructor', true)
    .is('deleted_at', null)
    .limit(2000);
  if (error) throw error;
  const coaches = (rows ?? []) as CoachRow[];

  const plan: PlanEntry[] = [];
  for (const { id, first, seed } of SEEDS) {
    const found = coaches.filter((c) => c.id.startsWith(id));
    const entry: PlanEntry = { id, first, kind: seed.kind, note: seed.note, set: {} };
    plan.push(entry);
    if (found.length !== 1) {
      entry.problem = found.length ? 'id prefix matches more than one coach' : 'no instructor with this id';
      continue;
    }
    const coach = found[0];
    entry.id = coach.id;

    if (seed.kind === 'none') continue;
    if (seed.kind === 'reject-all') {
      entry.set.card_photo_rejects = (await imagesOf(supabase, coach)).map((i) => i.url);
      continue;
    }

    const file = seed.file.startsWith('/') ? seed.file : path.join(COACH_MEDIA, seed.file);
    if (!existsSync(file)) {
      entry.problem = `file not found: ${seed.file}`;
      continue;
    }
    entry.sourceFile = file;
    entry.set.card_photo_box = seed.box;
    const bytes = readFileSync(file);

    if (seed.kind === 'upload') {
      const dest = `card-photos/seed/${coach.id}-${sha(bytes).slice(0, 12)}.jpg`;
      entry.upload = { path: dest, file };
      entry.set.card_photo_url = publicUrl(dest);
      continue;
    }

    // match / copy: find the coach's image that is the pick, by its pixels.
    const want = await fingerprint(bytes);
    let hit: { label: string; url: string; diff: number; bytes: Buffer } | null = null;
    for (const img of await imagesOf(supabase, coach)) {
      const got = await download(img.url);
      const fp = got && (await fingerprint(got));
      // Same shape (the audit kept some photos at a smaller size), then the same pixels.
      if (!want || !got || !fp || Math.abs(fp.w / fp.h - want.w / want.h) > 0.01) continue;
      const diff = difference(fp.px, want.px);
      if (diff <= MATCH_LIMIT && (!hit || diff < hit.diff)) hit = { ...img, diff, bytes: got };
    }
    if (!hit) {
      entry.problem = "NO MATCH: none of the coach's current images is the pick";
      continue;
    }
    entry.note += ` [${hit.label}, ${hit.diff.toFixed(1)} grey levels]`;
    const want256 = sha(hit.bytes);
    const inStorage = hit.url.startsWith(`${base}/storage/v1/object/public/`);
    if (seed.kind === 'copy' || !inStorage) {
      const dest = `card-photos/seed/${coach.id}-${want256.slice(0, 12)}.jpg`;
      entry.upload = { path: dest, from: hit.url };
      entry.set.card_photo_url = publicUrl(dest);
    } else {
      entry.set.card_photo_url = hit.url;
    }
  }

  const jeisson = coaches.filter((c) => JEISSON.test((c.name ?? '').trim()));
  console.log(apply ? 'APPLY\n' : 'DRY RUN: nothing is written\n');
  for (const e of plan) {
    console.log(`${e.first} (${e.id.slice(0, 8)}): ${e.kind}, ${e.note}`);
    if (e.problem) console.log(`   PROBLEM: ${e.problem}`);
    if (e.upload)
      console.log(
        `   ${apply ? 'uploads' : 'would upload'} ${e.upload.file ? path.basename(e.upload.file) : short(e.upload.from!)} -> ${BUCKET}/${e.upload.path}`
      );
    if (e.set.card_photo_url) console.log(`   card_photo_url  = ${short(e.set.card_photo_url)}`);
    if (e.set.card_photo_box) console.log(`   card_photo_box  = ${JSON.stringify(e.set.card_photo_box)}`);
    if (e.set.card_photo_rejects) console.log(`   card_photo_rejects = ${e.set.card_photo_rejects.length} images`);
    if (e.kind === 'none') console.log('   nothing set');
  }
  console.log(
    `\nJeisson: ${jeisson.length ? `${jeisson.length} instructor(s) match the name; not seeded (no photo)` : 'no instructor by that name; nothing to seed'}`
  );
  if (planOut) writeFileSync(planOut, JSON.stringify(plan, null, 1));

  if (!apply) return;
  for (const e of plan) {
    if (e.problem || e.kind === 'none') continue;
    if (e.upload) {
      const raw = e.upload.file ? readFileSync(e.upload.file) : await download(e.upload.from!);
      if (!raw) throw new Error(`${e.first}: could not read ${e.upload.file ?? e.upload.from}`);
      // Always a JPEG at the .jpg path (Marcela's cover is a WebP on her site),
      // orientation baked in (the box is in the oriented frame), at most 2400 px.
      const body = await sharp(raw)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(e.upload.path, body, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
      if (upErr) throw new Error(`${e.first}: upload failed: ${upErr.message}`);
    }
    const { error: upd } = await supabase.from('users').update(e.set).eq('id', e.id);
    if (upd) throw new Error(`${e.first}: update failed: ${upd.message}`);
    console.log(`applied: ${e.first}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
