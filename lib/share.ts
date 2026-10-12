/**
 * Share utilities for Tribe social distribution.
 *
 * Provides URL builders, bilingual message builders, and share actions
 * for sessions, instructors, and achievements.
 */

import { channelFor, trackEvent, type EventPropertyMap } from '@/lib/analytics';
import { SITE_URL } from '@/lib/http/siteUrl';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

export type ShareMethod = 'whatsapp' | 'twitter' | 'native' | 'clipboard';
/** What a high-level sharer reports: the method used, or that the person closed the sheet. */
export type ShareOutcome = ShareMethod | 'cancelled';

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

// T-DOMAIN1: the CANONICAL origin, never the browser's current one.
//
// Reading the sharer's own origin meant a share link carried whatever host
// they happened to be on. An admin or tester on a Vercel PREVIEW shared a
// preview URL -- one that stops resolving when the deployment is pruned -- and
// inside the native app that origin is the Capacitor host, which is not an
// address anyone else can open. Both produce a link that works for the person
// who made it and for nobody they send it to, which is the one failure a share
// feature cannot have.
const BASE_URL = SITE_URL;

// NOTE: every self-referencing URL carries a TRAILING SLASH. next.config.ts
// sets `trailingSlash: true`, so a slash-less path 308-redirects to the slashed
// one. Link-preview scrapers (WhatsApp, iMessage) do NOT follow that 308, so a
// slash-less share link unfurls as a bare URL with no OG card. Keep the slash.
export function getSessionShareUrl(sessionId: string): string {
  return `${BASE_URL}/s/${sessionId}/`;
}

export function getInstructorShareUrl(instructorId: string): string {
  return `${BASE_URL}/i/${instructorId}/`;
}

/** Invite-token acceptance link (the gated /invite/[token] flow). */
export function getInviteShareUrl(token: string): string {
  return `${BASE_URL}/invite/${token}/`;
}

export function getReferralShareUrl(referralCode: string): string {
  return `${BASE_URL}/auth/?ref=${referralCode}`;
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

  // ` · ` and not an em dash: em dashes are banned across the product, and the
  // details line already joins with ` · `, so one separator reads uniformly.
  return `${line1} · ${line2}`;
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

/**
 * T-ANALYTICS1: closing the share sheet is a choice, not a failure.
 *
 * navigator.share rejects with a DOMException named 'AbortError' when the
 * person dismisses the sheet. Left unhandled it reached PostHog as an
 * unhandled $exception on every cancel (seen on the preview), and handled
 * badly it was logged as an error or fell back to copying the link, which
 * then recorded a share that never happened.
 *
 * Checked by NAME, not `instanceof Error`: whether DOMException inherits from
 * Error has varied between engines and WebViews.
 */
export function isShareCancel(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

export type NativeShareResult = 'shared' | 'cancelled' | 'unavailable' | 'failed';

/**
 * The one way to open the system share sheet. Never throws. A cancel is
 * silent: no event, no log. Any other rejection (desktop browsers that expose
 * navigator.share but refuse it, a missing user gesture) is 'failed', so the
 * caller can fall back to copying the link.
 */
export async function nativeShare(data: ShareData): Promise<NativeShareResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unavailable';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    return isShareCancel(err) ? 'cancelled' : 'failed';
  }
}

export async function shareViaNative(title: string, text: string, url: string): Promise<NativeShareResult> {
  return nativeShare({ title, text, url });
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

/** What a sharer says about its content; executeShare adds the channel. */
type ShareEventContent = Omit<EventPropertyMap['share_link_created'], 'channel' | 'method'>;

async function executeShare(
  text: string,
  url: string,
  title: string,
  preferredMethod: ShareMethod | undefined,
  content: ShareEventContent
): Promise<ShareOutcome> {
  const method = preferredMethod ?? 'native';
  // T-ANALYTICS1 part D: channel is the dashboard-facing value (whatsapp /
  // copy / native / ...); method is kept as it was for older dashboards.
  const track = (used: ShareMethod) =>
    trackEvent('share_link_created', { ...content, channel: channelFor(used), method: used });

  if (method === 'whatsapp') {
    shareViaWhatsApp(text, url);
    track('whatsapp');
    return 'whatsapp';
  }

  if (method === 'twitter') {
    shareViaTwitter(text, url);
    track('twitter');
    return 'twitter';
  }

  // Try native, fall back to clipboard
  if (method === 'native' || method === 'clipboard') {
    const native = method === 'native' ? await shareViaNative(title, text, url) : 'unavailable';

    if (native === 'shared') {
      track('native');
      return 'native';
    }
    // The person closed the sheet: no share happened, so nothing is tracked
    // and nothing is copied behind their back.
    if (native === 'cancelled') return 'cancelled';

    const copied = await copyToClipboard(`${text}\n${url}`);
    if (copied) {
      track('clipboard');
      return 'clipboard';
    }
  }

  return 'clipboard';
}

export async function shareSession(
  data: SessionShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareOutcome> {
  const text = buildSessionShareText(data, language);
  const url = getSessionShareUrl(data.id);
  const result = await executeShare(text, url, data.title, preferredMethod, {
    content_type: 'session',
    content_id: data.id,
    session_id: data.id,
  });
  if (result === 'cancelled') return result;
  trackEvent('session_shared', {
    session_id: data.id,
    content_type: 'session',
    channel: channelFor(result),
    method: result,
  });
  return result;
}

export async function shareInstructor(
  data: InstructorShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareOutcome> {
  const text = buildInstructorShareText(data, language);
  const url = getInstructorShareUrl(data.id);
  return executeShare(text, url, data.name, preferredMethod, {
    content_type: 'instructor',
    content_id: data.id,
    instructor_id: data.id,
  });
}

export async function shareAchievement(
  data: AchievementShareData,
  language: 'en' | 'es' = 'en',
  preferredMethod?: ShareMethod
): Promise<ShareOutcome> {
  const text = buildAchievementShareText(data, language);
  // Achievements link to the app root
  const url = BASE_URL;
  return executeShare(text, url, 'Tribe', preferredMethod, {
    content_type: 'achievement',
    content_id: data.type,
    achievement_type: data.type,
  });
}
