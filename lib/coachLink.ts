import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';

/**
 * T-SHARE1 Part C. A coach's own link, tribelatam.com/i/<handle>, and what
 * goes with it: the handle rule (users.handle, migration 220), the suggestion
 * made from a first name, and the WhatsApp message the "Tu link" block sends.
 * Client-safe: the profile editor and the dashboard both use it.
 */

/** Lowercase letters, digits and underscore, 3 to 24 long. Same as users_handle_format (220). */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /i/<x>: a uuid is the account id; anything else is a handle. A handle cannot look like a uuid (no hyphens). */
export function isUserId(x: string): boolean {
  return UUID.test(x);
}

export type HandleProblem = 'short' | 'long' | 'chars';

/** Why a handle is refused, or null when it fits. Uniqueness is the database's to answer (users_handle_key). */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length < 3) return 'short';
  if (handle.length > 24) return 'long';
  return HANDLE_PATTERN.test(handle) ? null : 'chars';
}

/** What a typed handle becomes: trimmed and lowercased. Anything else stays for handleProblem to name. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * The handle suggested on a coach's first visit: their first name without
 * accents or symbols ("Andrés Varón" -> "andres"). Padded with "_coach" when
 * that is shorter than three; null when nothing usable is left.
 */
export function suggestHandle(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const plain = first
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
  if (!plain) return null;
  return plain.length >= 3 ? plain : `${plain}_coach`;
}

/** A public object in this project's Supabase storage: the only images a share card ever draws (no hotlinks, no stock sites). */
export function isTribeStorageUrl(
  url: string | null | undefined,
  base = process.env.NEXT_PUBLIC_SUPABASE_URL
): boolean {
  if (!url || !base) return false;
  return url.startsWith(`${base.replace(/\/+$/, '')}/storage/v1/object/public/`);
}

/** The coach's public link: the handle when they have one, the account id otherwise. */
export function coachLink(user: { id: string; handle?: string | null }): string {
  return `${CANONICAL_SITE_URL}/i/${user.handle || user.id}`;
}

/** The message "Compartir por WhatsApp" sends, in the coach's language. */
const SHARE_MESSAGE: Record<'es' | 'en', string> = {
  es: 'Esta es mi página en Tribe. Ahí están mis clases de la semana y puedes pedir cupo con tu nombre y WhatsApp: ',
  en: 'This is my page on Tribe. My classes for the week are there, and you can ask for a spot with your name and WhatsApp: ',
};

export function coachShareMessage(link: string, language: 'es' | 'en'): string {
  return `${SHARE_MESSAGE[language] ?? SHARE_MESSAGE.es}${link}`;
}

/** wa.me with no number: WhatsApp opens its chat picker with the message filled in. */
export function whatsappShareHref(link: string, language: 'es' | 'en'): string {
  return `https://wa.me/?text=${encodeURIComponent(coachShareMessage(link, language))}`;
}
