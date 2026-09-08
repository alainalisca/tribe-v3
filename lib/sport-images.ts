/**
 * Default hero images and gradients for sport categories.
 * Used as SessionCard cover images when no session-specific photo exists.
 */

const DEFAULT_SPORT_IMAGE = '/images/sports/default.jpg';

/**
 * Sport hero photos, keyed by the stored sport name lowercased, because
 * getSessionHeroImage() lowercases before looking up. That means multi-word
 * sports keep their space ('muay thai'), even though the file on disk is
 * hyphenated.
 *
 * Only sports with a real shipped photo appear here. A sport that is absent
 * falls through to its gradient, which is the correct floor — better than a
 * 404 flashing to the gradient via onError. Sources and licences for every
 * file are in public/images/sports/CREDITS.md.
 *
 * Still on the gradient, no photo shipped: Muay Thai, Kickboxing, Jiu-Jitsu,
 * Volleyball, Padel, Skateboarding, BMX.
 */
const SPORT_IMAGES: Record<string, string> = {
  running: '/images/sports/running.jpg',
  hiking: '/images/sports/hiking.jpg',
  cycling: '/images/sports/cycling.jpg',
  swimming: '/images/sports/swimming.jpg',
  crossfit: '/images/sports/crossfit.jpg',
  hyrox: '/images/sports/hyrox.jpg',
  weightlifting: '/images/sports/weightlifting.jpg',
  calisthenics: '/images/sports/calisthenics.jpg',
  boxing: '/images/sports/boxing.jpg',
  basketball: '/images/sports/basketball.jpg',
  soccer: '/images/sports/soccer.jpg',
  yoga: '/images/sports/yoga.jpg',
  pilates: '/images/sports/pilates.jpg',
  dance: '/images/sports/dance.jpg',
  tennis: '/images/sports/tennis.jpg',
  // 'Other' is the one category with no imagery of its own, so it is what
  // the generic default photo is for.
  other: DEFAULT_SPORT_IMAGE,
};

/**
 * Resolve a session's hero image: the session's own photo, then the
 * instructor's banner, then a sport photo.
 *
 * Returns '' when the sport has no shipped photo. Callers read that as "skip
 * the <img>, render the gradient", which is why an unshipped sport must stay
 * out of SPORT_IMAGES: a path to a file that does not exist would 404 on every
 * card and flash to the gradient through onError, which is worse than simply
 * starting there.
 *
 * Note this deliberately does not end the chain at DEFAULT_SPORT_IMAGE for
 * every unknown sport. A Muay Thai session is better served by its own gradient
 * than by a generic rack-room photo.
 */
export function getSessionHeroImage(
  sport: string,
  sessionPhotos?: string[] | null,
  instructorBannerUrl?: string | null
): string {
  if (sessionPhotos && sessionPhotos.length > 0) return sessionPhotos[0];
  if (instructorBannerUrl) return instructorBannerUrl;

  return SPORT_IMAGES[sport.toLowerCase()] ?? '';
}

export function getSportGradient(sport: string): string {
  const gradients: Record<string, string> = {
    running: 'from-emerald-600 to-teal-800',
    yoga: 'from-purple-600 to-indigo-800',
    crossfit: 'from-red-600 to-orange-800',
    cycling: 'from-blue-600 to-cyan-800',
    swimming: 'from-cyan-500 to-blue-700',
    boxing: 'from-red-700 to-rose-900',
    pilates: 'from-pink-500 to-purple-700',
    hiking: 'from-green-600 to-emerald-800',
    strength: 'from-gray-700 to-zinc-900',
    dance: 'from-fuchsia-500 to-pink-700',
    basketball: 'from-orange-500 to-red-700',
    soccer: 'from-green-500 to-emerald-700',
    tennis: 'from-yellow-500 to-lime-700',
    martial_arts: 'from-red-600 to-gray-800',
    functional: 'from-slate-600 to-zinc-800',
    calisthenics: 'from-teal-600 to-cyan-800',
  };
  return gradients[sport.toLowerCase()] || 'from-tribe-green to-lime-700';
}
