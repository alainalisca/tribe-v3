/**
 * Default hero images and gradients for sport categories.
 * Used as SessionCard cover images when no session-specific photo exists.
 */

const SPORT_IMAGES: Record<string, string> = {
  running: '/images/sports/running.jpg',
  yoga: '/images/sports/yoga.jpg',
  crossfit: '/images/sports/crossfit.jpg',
  cycling: '/images/sports/cycling.jpg',
  swimming: '/images/sports/swimming.jpg',
  boxing: '/images/sports/boxing.jpg',
  pilates: '/images/sports/pilates.jpg',
  hiking: '/images/sports/hiking.jpg',
  basketball: '/images/sports/basketball.jpg',
  soccer: '/images/sports/soccer.jpg',
  tennis: '/images/sports/tennis.jpg',
  martial_arts: '/images/sports/martial_arts.jpg',
  dance: '/images/sports/dance.jpg',
  strength: '/images/sports/strength.jpg',
  functional: '/images/sports/functional.jpg',
  calisthenics: '/images/sports/calisthenics.jpg',
};

const DEFAULT_SPORT_IMAGE = '/images/sports/default.jpg';

export function getSessionHeroImage(
  sport: string,
  sessionPhotos?: string[] | null,
  instructorBannerUrl?: string | null
): string {
  if (sessionPhotos && sessionPhotos.length > 0) return sessionPhotos[0];
  if (instructorBannerUrl) return instructorBannerUrl;
  return SPORT_IMAGES[sport.toLowerCase()] || DEFAULT_SPORT_IMAGE;
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
