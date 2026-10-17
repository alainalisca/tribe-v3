/**
 * T-SITE1. Every URL the marketing site links to, in one place.
 */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
export const TV_CHANNEL_URL = 'https://www.youtube.com/@tribe-nunca-entrenes-solo';
export const CONTACT_EMAIL = 'info@tribelatam.com';

/** The site's pages, in nav order. `key` names the messages entry under site.nav. */
export const SITE_PAGES = [
  { key: 'athletes', href: '/para-atletas/' },
  { key: 'sports', href: '/deportes/' },
  { key: 'coaches', href: '/coaches/' },
  { key: 'gyms', href: '/gimnasios/' },
  { key: 'os', href: '/tribe-os/' },
  { key: 'tv', href: '/tv/' },
] as const;

/** The store a "Descarga la app" button should open on this device. */
export function storeUrlFor(userAgent: string): string {
  return /Android/i.test(userAgent) ? PLAY_STORE_URL : APP_STORE_URL;
}
