import type { CSSProperties } from 'react';

/**
 * T-SITE1 Part C. Every photo and mark the marketing site shows, by the mock's
 * key. A component asks for a key, never a path, so a wrong key fails to
 * compile and lib/site/photos.test.ts proves every file exists.
 *
 * Sources (all Al's own; nothing from Instagram, stock or Medellín Run Club):
 * - T-SITE1.1 Part B: cropped from the camera originals by
 *   scripts/site-crops.mjs, every job (source, crop box, anchor) recorded in
 *   "Homepage Photos/_mock/crops/jobs.json", which also lists the banned
 *   frames the script refuses. door_os is the Zona frame at 40% brightness.
 * - Older crops (row_*, strip2, hero_coach, al_zona): the face-aware
 *   pass, listed under `legacy` in the same jobs.json.
 * - hero_full: w0143, Zona de Combate on the plaza steps, uncropped 3:2.
 * - bb_w, fv_w: the mock's white BullBox and Fruta Vida marks.
 * - al_bb: n_9632 (rowing at BullBox), resized to 900x600 (Al, 2026-10-17).
 * - tv_wod, tv_wil: Tribe.TV posters (tv_wil from the camera original, no
 *   baked-in text); logo_w: the white wordmark.
 * - Site polish (2026-10-23, Al delegated the picks): essay_bb, essay_zona,
 *   close_team and hero_ath are whole 3:2 frames now; gym_pass, al_zona,
 *   hero_coach (+ hero_coach_m, its phone cut) and coach_andres (Andrés's
 *   roster card, website only) are new jobs in the same jobs.json. fv_c is
 *   Fruta Vida's colored logo from its brand file, for the Aliados card.
 * - Never Zona de Combate IMG_9764-9766, 9776-9777: a person who asked not to
 *   appear in Tribe media (Al, 2026-10-17). n_j0590.jpg is not placed until Al
 *   says "use it".
 */
export const SITE_PHOTOS = {
  hero_full: '/site/hero_full.jpg',
  hero_ath: '/site/hero_ath.jpg',
  hero_coach: '/site/hero_coach.jpg',
  hero_coach_m: '/site/hero_coach_m.jpg',
  gym_hero: '/site/gym_hero.jpg',
  door_ath: '/site/door_ath.jpg',
  door_coach: '/site/door_coach.jpg',
  door_gym: '/site/door_gym.jpg',
  door_os: '/site/door_os.jpg',
  row_hyrox: '/site/row_hyrox.jpg',
  row_cf: '/site/row_cf.jpg',
  row_box: '/site/row_box.jpg',
  row_comb: '/site/row_comb.jpg',
  row_run: '/site/row_run.jpg',
  strip2: '/site/strip2.jpg',
  essay_bb: '/site/essay_bb.jpg',
  essay_zona: '/site/essay_zona.jpg',
  essay_wil: '/site/essay_wil.jpg',
  essay_yoga: '/site/essay_yoga.jpg',
  close_team: '/site/close_team.jpg',
  ath_1: '/site/ath_1.jpg',
  ath_2: '/site/ath_2.jpg',
  ath_3: '/site/ath_3.jpg',
  coach_group: '/site/coach_group.jpg',
  gym_page: '/site/gym_page.jpg',
  gym_coaches: '/site/gym_coaches.jpg',
  gym_pass: '/site/gym_pass.jpg',
  gym_report: '/site/gym_report.jpg',
  os_photo: '/site/os_photo.jpg',
  sp_fuerza: '/site/sp_fuerza.jpg',
  sp_combate: '/site/sp_combate.jpg',
  sp_resist: '/site/sp_resist.jpg',
  sp_mente: '/site/sp_mente.jpg',
  al_bb: '/site/al_bb.jpg',
  al_zona: '/site/al_zona.jpg',
  coach_andres: '/site/coach_andres.jpg',
  bb_w: '/site/bb_w.png',
  fv_w: '/site/fv_w.png',
  fv_c: '/site/fv_c.png',
  tv_wod: '/tribe-tv/ep-wod-bullbox.jpg',
  tv_wil: '/tribe-tv/ep-mma-zona.jpg',
  logo_w: '/tribe-wordmark.png',
} as const;

export type PhotoKey = keyof typeof SITE_PHOTOS;

/**
 * Site polish (Al, 2026-10-23). A coach whose app photo does not work on the
 * site gets one of Al's photos on the roster instead, by user id. Website
 * only: the coach's app avatar is never touched.
 */
export const COACH_SITE_PHOTOS: Readonly<Record<string, PhotoKey>> = {
  // Andrés: his avatar is a group shot.
  '34d56f30-f8d2-4588-beaa-07ee53d13d1d': 'coach_andres',
};

/** The public path for a photo key. */
export function photo(key: PhotoKey): string {
  return SITE_PHOTOS[key];
}

/** Marks whose alt is the brand name itself, not a site.alt.<key> description. */
export const SITE_MARKS: readonly PhotoKey[] = ['bb_w', 'fv_w', 'fv_c', 'logo_w'];

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
  // T-SITE1.1 Part B and the site polish: written by scripts/site-crops.mjs into jobs.json.
  hero_coach: [51, 29],
  hero_coach_m: [50, 22],
  hero_ath: [47, 55],
  door_ath: [46, 38],
  door_coach: [43, 35],
  essay_bb: [49, 21],
  essay_zona: [36, 21],
  essay_wil: [32, 31],
  essay_yoga: [64, 30],
  close_team: [47, 36],
  ath_1: [54, 30],
  ath_2: [50, 28],
  ath_3: [62, 36],
  coach_group: [50, 22],
  gym_coaches: [50, 19],
  gym_pass: [58, 24],
  os_photo: [64, 35],
  sp_fuerza: [50, 18],
  sp_combate: [32, 33],
  sp_resist: [82, 33],
  sp_mente: [62, 35],
  tv_wil: [42, 26],
  al_zona: [40, 24],
  coach_andres: [50, 18],
  // Read off a 10% grid (T-SITE1.1 Part A).
  row_hyrox: [56, 24],
  row_cf: [51, 26],
  row_box: [50, 17],
  row_comb: [50, 15],
  row_run: [55, 34],
  strip2: [71, 20],
  al_bb: [85, 32],
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
  hero_ath: [1600, 1067],
  hero_coach: [1800, 750],
  gym_hero: [1600, 667],
  close_team: [1600, 1067],
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
