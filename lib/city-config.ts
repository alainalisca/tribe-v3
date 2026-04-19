/**
 * City configuration for Medellín-first localization.
 *
 * Every city-specific value lives here so the app can expand to other cities
 * by adding a new config and changing ACTIVE_CITY.
 */

export interface Neighborhood {
  id: string;
  name: string; // Display name (same EN/ES — neighborhood names don't translate)
  slug: string; // URL-safe: "el-poblado"
  emoji: string;
  description: {
    en: string;
    es: string;
  };
  /** Bounding box (SW corner → NE corner) for geo-matching */
  bounds: {
    sw: { lat: number; lng: number };
    ne: { lat: number; lng: number };
  };
  /** Center point for distance calculations */
  center: { lat: number; lng: number };
  comuna?: string;
  isPopular: boolean;
  sortOrder: number;
}

export interface CityConfig {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  currency: 'COP' | 'USD';
  timezone: string;
  center: { lat: number; lng: number };
  defaultZoomLevel: number;
  tagline: { en: string; es: string };
  subtitle: { en: string; es: string };
  joinCTA: { en: string; es: string };
  weatherLocation: { lat: number; lng: number };
  neighborhoods: Neighborhood[];
}

// ═══════════════════════════════════════════
// MEDELLÍN CONFIG
// ═══════════════════════════════════════════

export const MEDELLIN_CONFIG: CityConfig = {
  id: 'medellin',
  name: 'Medellín',
  country: 'Colombia',
  countryCode: 'CO',
  currency: 'COP',
  timezone: 'America/Bogota',
  center: { lat: 6.2442, lng: -75.5812 },
  defaultZoomLevel: 13,
  tagline: {
    en: 'Never Train Alone in Medellín',
    es: 'Nunca Entrenes Solo en Medellín',
  },
  subtitle: {
    en: "Join the fitness community that's taking over the city",
    es: 'Únete a la comunidad fitness que está cambiando la ciudad',
  },
  joinCTA: {
    en: 'Join the Tribe',
    es: 'Únete al Tribe',
  },
  weatherLocation: { lat: 6.2442, lng: -75.5812 },
  neighborhoods: [
    {
      id: 'el-poblado',
      name: 'El Poblado',
      slug: 'el-poblado',
      emoji: '🏙️',
      description: {
        en: 'The fitness hub of Medellín. Parque Lleras, outdoor gyms, and the highest concentration of instructors on Tribe.',
        es: 'El centro fitness de Medellín. Parque Lleras, gimnasios al aire libre y la mayor concentración de instructores en Tribe.',
      },
      bounds: {
        sw: { lat: 6.19, lng: -75.585 },
        ne: { lat: 6.215, lng: -75.555 },
      },
      center: { lat: 6.2087, lng: -75.5659 },
      comuna: 'Comuna 14',
      isPopular: true,
      sortOrder: 1,
    },
    {
      id: 'laureles',
      name: 'Laureles',
      slug: 'laureles',
      emoji: '🌳',
      description: {
        en: 'Chill vibes, great parks, and a growing running scene. Perfect for outdoor sessions and morning yoga.',
        es: 'Buena vibra, parques geniales y una escena creciente de running. Perfecto para sesiones al aire libre.',
      },
      bounds: {
        sw: { lat: 6.238, lng: -75.605 },
        ne: { lat: 6.257, lng: -75.578 },
      },
      center: { lat: 6.2467, lng: -75.5907 },
      comuna: 'Comuna 11',
      isPopular: true,
      sortOrder: 2,
    },
    {
      id: 'envigado',
      name: 'Envigado',
      slug: 'envigado',
      emoji: '🏋️',
      description: {
        en: 'Local favorite. CrossFit boxes, running groups, and a tight-knit fitness community south of the valley.',
        es: 'Favorito local. Boxes de CrossFit, grupos de running y una comunidad fitness muy unida al sur del valle.',
      },
      bounds: {
        sw: { lat: 6.155, lng: -75.605 },
        ne: { lat: 6.19, lng: -75.56 },
      },
      center: { lat: 6.1714, lng: -75.5825 },
      comuna: undefined,
      isPopular: true,
      sortOrder: 3,
    },
    {
      id: 'centro',
      name: 'Centro',
      slug: 'centro',
      emoji: '🏛️',
      description: {
        en: 'The beating heart of Medellín. Barefoot Park, Parque de las Luces, and free outdoor workout spots everywhere.',
        es: 'El corazón de Medellín. Parque de los Pies Descalzos, Parque de las Luces y gimnasios al aire libre por todos lados.',
      },
      bounds: {
        sw: { lat: 6.238, lng: -75.578 },
        ne: { lat: 6.258, lng: -75.558 },
      },
      center: { lat: 6.2518, lng: -75.5636 },
      comuna: 'Comuna 10 - La Candelaria',
      isPopular: true,
      sortOrder: 4,
    },
    {
      id: 'belen',
      name: 'Belén',
      slug: 'belen',
      emoji: '🏡',
      description: {
        en: 'Residential neighborhood with strong community energy. Growing fitness scene and affordable sessions.',
        es: 'Barrio residencial con energía comunitaria fuerte. Escena fitness creciente y sesiones accesibles.',
      },
      bounds: {
        sw: { lat: 6.215, lng: -75.615 },
        ne: { lat: 6.242, lng: -75.59 },
      },
      center: { lat: 6.2314, lng: -75.6045 },
      comuna: 'Comuna 16',
      isPopular: true,
      sortOrder: 5,
    },
    {
      id: 'sabaneta',
      name: 'Sabaneta',
      slug: 'sabaneta',
      emoji: '🌄',
      description: {
        en: 'Up-and-coming fitness scene south of Envigado. Great parks and affordable sessions.',
        es: 'Escena fitness emergente al sur de Envigado. Buenos parques y sesiones accesibles.',
      },
      bounds: {
        sw: { lat: 6.135, lng: -75.62 },
        ne: { lat: 6.155, lng: -75.595 },
      },
      center: { lat: 6.1513, lng: -75.6168 },
      comuna: undefined,
      isPopular: true,
      sortOrder: 6,
    },
    {
      id: 'estadio',
      name: 'Estadio',
      slug: 'estadio',
      emoji: '⚽',
      description: {
        en: 'Sports district around the Atanasio Girardot stadium. Running tracks, cycling lanes, and group training spots.',
        es: 'Zona deportiva alrededor del estadio Atanasio Girardot. Pistas de atletismo, ciclovías y zonas de entrenamiento grupal.',
      },
      bounds: {
        sw: { lat: 6.247, lng: -75.592 },
        ne: { lat: 6.26, lng: -75.578 },
      },
      center: { lat: 6.2561, lng: -75.5872 },
      comuna: 'Comuna 11',
      isPopular: false,
      sortOrder: 7,
    },
    {
      id: 'la-america',
      name: 'La América',
      slug: 'la-america',
      emoji: '🏘️',
      description: {
        en: 'West-central Medellín with accessible gyms and a strong neighborhood workout culture.',
        es: 'Centro-occidente de Medellín con gimnasios accesibles y una fuerte cultura de entrenamiento barrial.',
      },
      bounds: {
        sw: { lat: 6.242, lng: -75.61 },
        ne: { lat: 6.256, lng: -75.592 },
      },
      center: { lat: 6.2488, lng: -75.601 },
      comuna: 'Comuna 12',
      isPopular: false,
      sortOrder: 8,
    },
  ],
};

// ═══════════════════════════════════════════
// ACTIVE CITY — change this one line to expand
// ═══════════════════════════════════════════

export const ACTIVE_CITY: CityConfig = MEDELLIN_CONFIG;

// ═══════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════

/**
 * Determine which neighborhood a lat/lng falls in.
 * Returns the matching neighborhood or null.
 */
export function detectNeighborhood(lat: number, lng: number): Neighborhood | null {
  for (const hood of ACTIVE_CITY.neighborhoods) {
    if (
      lat >= hood.bounds.sw.lat &&
      lat <= hood.bounds.ne.lat &&
      lng >= hood.bounds.sw.lng &&
      lng <= hood.bounds.ne.lng
    ) {
      return hood;
    }
  }
  return null;
}

/**
 * Get the nearest neighborhood by center-point distance.
 * Fallback when bounding box doesn't match.
 */
export function getNearestNeighborhood(lat: number, lng: number): Neighborhood {
  let nearest = ACTIVE_CITY.neighborhoods[0];
  let minDist = Infinity;
  for (const hood of ACTIVE_CITY.neighborhoods) {
    const dist = Math.sqrt(Math.pow(lat - hood.center.lat, 2) + Math.pow(lng - hood.center.lng, 2));
    if (dist < minDist) {
      minDist = dist;
      nearest = hood;
    }
  }
  return nearest;
}

/**
 * Get only the popular neighborhoods (for filter pills).
 */
export function getPopularNeighborhoods(): Neighborhood[] {
  return ACTIVE_CITY.neighborhoods.filter((n) => n.isPopular).sort((a, b) => a.sortOrder - b.sortOrder);
}
