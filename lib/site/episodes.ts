/**
 * T-SITE1. Tribe.TV episodes. To add one: drop the thumbnail in public/tribe-tv/
 * and add an entry at the TOP of EPISODES (newest first; the first is featured).
 * Titles live here rather than in messages because they belong to the episode
 * record, the same way a session title does.
 */
export type Episode = {
  /** YouTube video id. */
  id: string;
  title: { es: string; en: string };
  /** Null until confirmed. */
  coach: string | null;
  gym: string;
  sport: string;
  /** Minutes. Null until confirmed from YouTube; the /tv page hides a null. */
  duration: number | null;
  /** ISO date. Null until confirmed from YouTube. */
  published: string | null;
  /** Path under public/. */
  thumb: string;
  alt: { es: string; en: string };
};

export const EPISODES: Episode[] = [
  {
    id: 'uuR0852_RxA',
    title: {
      es: 'El WOD completo: coach y atleta en BullBox',
      en: 'The full WOD: coach and athlete at BullBox',
    },
    coach: null,
    gym: 'BullBox',
    sport: 'CrossFit',
    duration: null,
    published: null,
    thumb: '/tribe-tv/ep-wod-bullbox.jpg',
    alt: {
      es: 'Portada del episodio El WOD completo',
      en: 'Cover of the episode The full WOD',
    },
  },
  {
    id: 'LJHYuu4_s4o',
    title: {
      es: 'Un viernes con el profe Wil al aire libre',
      en: 'A Friday outdoors with coach Wil',
    },
    coach: 'Profe Wil',
    gym: 'Zona de Combate',
    sport: 'MMA',
    duration: null,
    published: null,
    thumb: '/tribe-tv/ep-mma-zona.jpg',
    alt: {
      es: 'Portada del episodio Un viernes con el profe Wil',
      en: 'Cover of the episode A Friday with coach Wil',
    },
  },
];

/** Announced, not published. Shown dimmed and not clickable. */
export const UPCOMING_EPISODE = { es: 'HYROX en BullBox', en: 'HYROX at BullBox' };

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
