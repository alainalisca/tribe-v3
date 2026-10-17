import type { CSSProperties } from 'react';

/**
 * T-SITE1 Part C. Every photo and mark the marketing site shows, by the mock's
 * key. A component asks for a key, never a path, so a wrong key fails to
 * compile and lib/site/photos.test.ts proves every file exists.
 *
 * Sources (all Al's own; nothing from Instagram, stock or Medellín Run Club):
 * - The face-aware crops, byte-identical to "Homepage Photos/_mock/crops"
 *   (jobs.json; sizes and aspects are final).
 * - hero_full: w0143, Zona de Combate on the plaza steps, uncropped 3:2.
 *   hero_tall was dropped (Al, 2026-10-16): a tall crop cuts faces.
 * - pad_tall: the Salomón padwork photo, the one Salomón photo on Inicio.
 * - barbell: BullBox barbell prep.
 * - bb_w, fv_w: the mock's white BullBox and Fruta Vida marks.
 * - al_bb: n_9632 (rowing at BullBox), resized to 900x600. The original crop
 *   was the same frame as door_gym (Al, 2026-10-17).
 * - tv_wod, tv_wil: Tribe.TV frames; logo_w: the white wordmark.
 * - "rowers" was removed 2026-10-16 (not Al's photo). n_j0590.jpg is flagged
 *   as its replacement and is not placed until Al says "use it".
 */
export const SITE_PHOTOS = {
  hero_full: '/site/hero_full.jpg',
  hero_ath: '/site/hero_ath.jpg',
  hero_coach: '/site/hero_coach.jpg',
  hero_gym: '/site/hero_gym.jpg',
  door_ath: '/site/door_ath.jpg',
  door_coach: '/site/door_coach.jpg',
  door_gym: '/site/door_gym.jpg',
  row_hyrox: '/site/row_hyrox.jpg',
  row_cf: '/site/row_cf.jpg',
  row_box: '/site/row_box.jpg',
  row_comb: '/site/row_comb.jpg',
  row_run: '/site/row_run.jpg',
  row_yoga: '/site/row_yoga.jpg',
  ro_andres: '/site/ro_andres.jpg',
  ro_alex: '/site/ro_alex.jpg',
  ro_wil: '/site/ro_wil.jpg',
  pad_tall: '/site/pad_tall.jpg',
  mos1: '/site/mos1.jpg',
  mos4: '/site/mos4.jpg',
  mos5: '/site/mos5.jpg',
  barbell: '/site/barbell.jpg',
  close_team: '/site/close_team.jpg',
  split_ath: '/site/split_ath.jpg',
  strip1: '/site/strip1.jpg',
  strip2: '/site/strip2.jpg',
  strip3: '/site/strip3.jpg',
  sp_fuerza: '/site/sp_fuerza.jpg',
  sp_combate: '/site/sp_combate.jpg',
  sp_resist: '/site/sp_resist.jpg',
  sp_mente: '/site/sp_mente.jpg',
  al_bb: '/site/al_bb.jpg',
  al_zona: '/site/al_zona.jpg',
  bb_w: '/site/bb_w.png',
  fv_w: '/site/fv_w.png',
  tv_wod: '/tribe-tv/ep-wod-bullbox.jpg',
  tv_wil: '/tribe-tv/ep-mma-zona.jpg',
  logo_w: '/tribe-wordmark.png',
} as const;

export type PhotoKey = keyof typeof SITE_PHOTOS;

/** The public path for a photo key. */
export function photo(key: PhotoKey): string {
  return SITE_PHOTOS[key];
}

/** Marks whose alt is the brand name itself, not a site.alt.<key> description. */
export const SITE_MARKS: readonly PhotoKey[] = ['bb_w', 'fv_w', 'logo_w'];

/**
 * T-SITE1.1 Part A. Where the faces are in each people photo: [x, y] as
 * percentages of the image (the centre of the faces in frame). A photo with an
 * anchor is shown with object-position at that point, which keeps the point
 * inside its box at every width (object-fit: cover maps p% of the image onto
 * p% of the box). e2e/faces.spec.ts checks the point is painted at four
 * viewports. Read off a 10% grid over each file (Al's photos, 2026-10-17).
 */
export const FACE_ANCHORS: Partial<Record<PhotoKey, readonly [number, number]>> = {
  hero_full: [55, 35],
  hero_ath: [67, 23],
  hero_coach: [52, 25],
  hero_gym: [47, 31],
  door_ath: [60, 34],
  door_coach: [46, 19],
  door_gym: [44, 46],
  row_hyrox: [56, 24],
  row_cf: [51, 26],
  row_box: [50, 17],
  row_comb: [50, 15],
  row_run: [55, 34],
  row_yoga: [58, 22],
  ro_andres: [45, 30],
  ro_alex: [74, 22],
  ro_wil: [51, 22],
  pad_tall: [62, 20],
  mos1: [36, 28],
  mos4: [50, 25],
  mos5: [50, 22],
  close_team: [47, 31],
  split_ath: [56, 11],
  strip1: [44, 16],
  strip2: [71, 20],
  strip3: [45, 18],
  sp_fuerza: [53, 24],
  sp_combate: [53, 27],
  sp_resist: [50, 52],
  sp_mente: [58, 24],
  al_bb: [85, 32],
  al_zona: [21, 22],
};

/**
 * Props for a people photo's <Image>: object-position on its faces and the
 * `data-face-anchor` the face test reads. Empty for a photo without people.
 */
export function faceProps(key: PhotoKey): { style?: CSSProperties; 'data-face-anchor'?: string } {
  const anchor = FACE_ANCHORS[key];
  if (!anchor) return {};
  const [x, y] = anchor;
  return { style: { objectPosition: `${x}% ${y}%` }, 'data-face-anchor': `${x} ${y}` };
}

/** Pixel size of the photos that fill a section's background, for aspect-tied min-heights. */
export const BACKGROUND_SIZES: Partial<Record<PhotoKey, readonly [number, number]>> = {
  hero_full: [1600, 1067],
  hero_ath: [1800, 750],
  hero_coach: [1800, 750],
  hero_gym: [1800, 750],
  close_team: [1800, 783],
};

/**
 * Style for a full-width photo background box: `--ar` is the photo's aspect,
 * which the box's CSS turns into min-height: calc(100vw / var(--ar) / 2), so at
 * least half of the scaled photo is always on screen around its faces.
 */
export function backgroundBoxStyle(key: PhotoKey): CSSProperties | undefined {
  const size = BACKGROUND_SIZES[key];
  return size ? ({ '--ar': (size[0] / size[1]).toFixed(4) } as CSSProperties) : undefined;
}
