/**
 * Share utilities for Tribe social distribution.
 *
 * Provides URL builders, bilingual message builders, and share actions
 * for sessions, instructors, and achievements.
 */

import { trackEvent } from '@/lib/analytics';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type ShareMethod = 'whatsapp' | 'twitter' | 'native' | 'clipboard';

export interface SessionShareData {
  id: string;
  title: string;
  sport: string;
  date: string;
  time?: string | null;
  price?: number | null;
  priceCents?: number | null;
  currency?: string;
  neighborhood?: string | null;
  instructorName?: string | null;
  spotsLeft?: number | null;
}

export interface InstructorShareData {
  id: string;
  name: string;
  sport?: string | null;
  sports?: string[] | null;
  averageRating?: number | null;
}

export interface AchievementShareData {
  type: 'session_completed' | 'streak' | 'badge';
  title: string;
  userName?: string | null;
  count?: number | null;
  emoji?: string;
}

// ═══════════════════════════════════════════
// URL BUILDERS
// ═══════════════════════════════════════════

const BASE_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || 'https://app.tribesocial.co';

export function getSessionShareUrl(sessionId: string): string {
  return `${BASE_URL}/s/${sessionId}`;
}

export function getInstructorShareUrl(instructorId: string): string {
  return `${BASE_URL}/i/${instructorId}`;
}

export function getReferralShareUrl(referralCode: string): string {
  return `${BASE_URL}/auth?ref=${referralCode}`;
}

// ═══════════════════════════════════════════
// MESSAGE BUILDERS (bilingual EN/ES)
// ═══════════════════════════════════════════

export function buildSessionShareText(data: SessionShareData, language: 'en' | 'es' = 'en'): string {
  const { title, sport, date, time, price, priceCents, currency, neighborhood, instructorName, spotsLeft } = data;

  const dateStr = new Date(date + 'T12:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeStr = time
    ? new Date(`2000-01-01T${time}`).toLocaleTimeString(language === 'es' ? 'es-CO' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const isFree = !price && !priceCents;
  const priceStr = isFree
    ? language === 'es'
      ? 'Gratis'
      : 'Free'
    : priceCents
      ? `$${(priceCents / 100).toLocaleString()} ${currency || 'COP'}`
      : `$${price?.toLocaleString()} ${currency || 'COP'}`;

  const parts: string[] = [];

  // Title with instructor
  if (instructorName) {
    parts.push(language === 'es' ? `${title} con ${instructorName}` : `${title} with ${instructorName}`);
  } else {
    parts.push(title);
  }

  // Location
  if (neighborhood) {
    parts.push(language === 'es' ? `en ${neighborhood}` : `in ${neighborhood}`);
  }

  // Date/time/price line
  const details: string[] = [];
  details.push(dateStr);
  if (timeStr) details.push(timeStr);
  details.push(priceStr);
  if (spotsLeft != null && spotsLeft > 0) {
    details.push(language === 'es' ? `${spotsLeft} cupos!` : `${spotsLeft} spots left!`);
  }

  const line1 = parts.join(' ');
  const line2 = details.join(' · ');

  return `${line1} — ${line2}`;
}

export function buildInstructorShareText(data: InstructorShareData, language: 'en' | 'es' = 'en'): string {
  const { name, sports, sport, averageRating } = data;
  const sportLabel = sport || (sports && sports.length > 0 ? sports[0] : null);
  const ratingStr = averageRating ? `(${averageRating.toFixed(1)}★)` : '';

  if (language === 'es') {
    return sportLabel
      ? `Mira a ${name}, instructor de ${sportLabel} en Tribe ${ratingStr}`.trim()
      : `Mira a ${name} en Tribe ${ratingStr}`.trim();
  }

  return sportLabel
    ? `Check out ${name}, ${sportLabel} instructor on Tribe ${ratingStr}`.trim()
    : `Check out ${name} on Tribe ${ratingStr}`.trim();
}

export function buildAchievementShareText(data: AchievementShareData, language: 'en' | 'es' = 'en'): string {
  const { type, title, count } = data;

  if (type === 'streak' && count) {
    return language === 'es'
      ? `${count} dias seguidos entrenando en Tribe! ${data.emoji || '🔥'}`
      : `${count}-day training streak on Tribe! ${data.emoji || '🔥'}`;
  }

  if (type === 'badge') {
    return language === 'es'
      ? `Acabo de ganar "${title}" en Tribe! ${data.emoji || '🏆'}`
      : `Just earned "${title}" on Tribe! ${data.emoji || '🏆'}`;
  }

  // session_completed
  return language === 'es'
    ? `Acabo de completar ${title} en Tribe! ${data.emoji || '💪'}`
    : `Just completed ${title} on Tribe! ${data.emoji || '💪'}`;
}

// ═══════════════════════════════════════════
// SHARE ACTIONS
// ═══════════════════════════════════════════

export function shareViaWhatsApp(text: string, url: string): void {
  const encoded = encodeURIComponent(`${text}\n${url}`);
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

export function shareViaTwitter(text: string, url: string): void {
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);
  window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank');
}

export async function shareViaNative(title: string, text: string, url: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    // User cancelled or share failed
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════
// HIGH-LEVEL SHARERS
// ═══════════════════════════════════════════

async function executeShare(
  text: string,
  url: string,
  title: string,
  preferredMethod?: ShareMethod,
  eventProps?: Record<string, unknown>
): Promise<ShareMethod> {
  const method = preferredMethod ?? 'native';

  if (method === 'whatsapp') {
    shareViaWhatsApp(text, url);
    trackEvent('share_link_created', { method: 'whatsapp', ...eventProps });
    return 'whatsapp';
  }

  if (method === 'twitter') {
    shareViaTwitter(text, url);
    trackEvent('share_link_created', { method: 'twitter', ...eventProps });
    return 'twitter';
  }

  // Try native, fall back to clipboard
  if (method === 'native' || method === 'clipboard') {
    const shared = method === 'native' ? await shareViaNative(title, text, url) : false;

    if (shared) {
      trackEvent('share_link_created', { method: 'native', ...eventProps });
      return 'native';
    }

    const copied = await copyToClipboard(`${text}\n${url}`);
    if (copied) {
      trackEvent('share_link_created', { method: 'clipboard', ...eventProps });
      return 'clipboard';
    }
  }

  return 'clipboard';
}

export async function shareSession(
  data: SessionShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareMethod> {
  const text = buildSessionShareText(data, language);
  const url = getSessionShareUrl(data.id);
  const result = await executeShare(text, url, data.title, preferredMethod, {
    content_type: 'session',
    session_id: data.id,
  });
  trackEvent('session_shared', { session_id: data.id, method: result });
  return result;
}

export async function shareInstructor(
  data: InstructorShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareMethod> {
  const text = buildInstructorShareText(data, language);
  const url = getInstructorShareUrl(data.id);
  return executeShare(text, url, data.name, preferredMethod, {
    content_type: 'instructor',
    instructor_id: data.id,
  });
}

export async function shareAchievement(
  data: AchievementShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareMethod> {
  const text = buildAchievementShareText(data, language);
  // Achievements link to the app root
  const url = BASE_URL;
  return executeShare(text, url, 'Tribe', preferredMethod, {
    content_type: 'achievement',
    achievement_type: data.type,
  });
}
