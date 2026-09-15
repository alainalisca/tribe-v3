/**
 * Assembles the photo list behind a session card's hero carousel.
 *
 * Pure and side-effect free: components never fetch, the page hook supplies the
 * inputs. See lib/dal/sessions.ts for where recap photos come from.
 */

export type CardPhotoKind = 'session' | 'recap' | 'banner';

export interface CardPhoto {
  src: string;
  kind: CardPhotoKind;
}

interface BuildCardPhotosInput {
  /** The session's own photos, in stored order. */
  sessionPhotos?: string[] | null;
  /** The instructor's recent recap photos, newest first, already filtered for `reported`. */
  recapPhotos?: string[] | null;
  /** The instructor's profile banner. */
  bannerUrl?: string | null;
  max?: number;
}

/**
 * Order: the session's own photos, then the instructor's recent recap photos,
 * then the banner. De-duplicated by URL and capped.
 *
 * The banner is deliberately only a slide when nothing else exists. It is a
 * profile header, not a photo of this session, and appending it after real
 * photos would put the same image on the end of every card by that instructor
 * and turn most single-photo cards into two-slide carousels. When it is the
 * only thing available it becomes the hero, which is what getSessionHeroImage
 * already does today.
 *
 * An empty result means the card falls back to the sport photo or gradient with
 * no carousel chrome, exactly as before this feature.
 */
export function buildCardPhotos({ sessionPhotos, recapPhotos, bannerUrl, max = 6 }: BuildCardPhotosInput): CardPhoto[] {
  const photos: CardPhoto[] = [
    ...(sessionPhotos ?? []).filter(Boolean).map((src): CardPhoto => ({ src, kind: 'session' })),
    ...(recapPhotos ?? []).filter(Boolean).map((src): CardPhoto => ({ src, kind: 'recap' })),
  ];

  if (photos.length === 0 && bannerUrl) {
    photos.push({ src: bannerUrl, kind: 'banner' });
  }

  const seen = new Set<string>();
  const deduped: CardPhoto[] = [];
  for (const photo of photos) {
    if (seen.has(photo.src)) continue;
    seen.add(photo.src);
    deduped.push(photo);
    if (deduped.length === max) break;
  }
  return deduped;
}
