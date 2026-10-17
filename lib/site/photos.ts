/**
 * T-SITE1 Part C. Every photo and mark the marketing site shows, by the mock's
 * key. A component asks for a key, never a path, so a wrong key fails to
 * compile and lib/site/photos.test.ts proves every file exists.
 *
 * Sources (all Al's own; nothing from Instagram, stock or Medellín Run Club):
 * - The 29 face-aware crops, byte-identical to "Homepage Photos/_mock/crops"
 *   (jobs.json; sizes and aspects are final).
 * - hero_full: w0143, Zona de Combate on the plaza steps, uncropped 3:2.
 *   hero_tall was dropped (Al, 2026-10-16): a tall crop cuts faces.
 * - pad_tall: the Salomón padwork photo, the one Salomón photo on Inicio.
 * - barbell: BullBox barbell prep.
 * - bb_w, fv_w: the mock's white BullBox and Fruta Vida marks.
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
