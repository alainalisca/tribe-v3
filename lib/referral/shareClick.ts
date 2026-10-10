/**
 * T-GROW2 B: log a `share_click` through /api/attr/ (attribution_events,
 * migration 213 already admits the event type).
 *
 * What a row means, field by field, because the visit columns are being reused:
 *   ref           the SHARER's code, so share clicks group with the leads and
 *                 signups that code later brings in
 *   src           'referral', the same value the shared link carries
 *   utm_source    the channel the person chose: whatsapp | copy | native
 *   landing_path  the screen the card was on (/pase/bullbox/, /session/{id}/, /profile/)
 *
 * The spec's success metric is "share clicks divided by confirmations", and this
 * is the numerator. Fire and forget: a blocked beacon costs a count, never a
 * share, and nothing here may delay WhatsApp opening.
 */
import { getSessionKey } from '@/lib/attribution';

export type ShareChannel = 'whatsapp' | 'copy' | 'native';

export function logShareClick(code: string, channel: ShareChannel, pathname: string): void {
  try {
    const sessionKey = getSessionKey();
    // Same rule as the visit beacon: no key, no event (session_key is NOT NULL).
    if (!sessionKey) return;
    void fetch('/api/attr/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event_type: 'share_click',
        session_key: sessionKey,
        ref: code,
        src: 'referral',
        utm_source: channel,
        landing_path: pathname,
      }),
    }).catch(() => {
      // Ad blockers block analytics-shaped paths. The share itself is unaffected.
    });
  } catch {
    // Never let a counter break the button it counts.
  }
}
