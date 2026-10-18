/**
 * T-JOIN1: warm a session's share card when the session is written, so the
 * card is in the CDN before anyone shares the link (a cold card took 2.5 to
 * 3.5 s on the preview, long enough for WhatsApp to keep an empty preview).
 * The page warms its card too (app/session/[id]/layout.tsx); this covers the
 * link shared straight from the app after creating or editing a session.
 *
 * The browser only asks; the server (app/api/sessions/[id]/warm-card) works
 * out the card's versioned URL and fetches it with after().
 */

/** The session fields the card shows (lib/og/sessionCard.ts sessionCardVersion). */
export const CARD_FIELDS = [
  'title',
  'sport',
  'date',
  'start_time',
  'location',
  'location_lat',
  'location_lng',
  'partner_id',
  'partner_status',
  // T-JOIN1b: marking or unmarking a test session changes what it shares as.
  'is_test',
  'status',
] as const;

/** Whether an update changes anything the card shows, compared with the row as it was. */
export function cardFieldsChanged(before: Record<string, unknown>, update: Record<string, unknown>): boolean {
  return CARD_FIELDS.some((k) => k in update && (update[k] ?? null) !== (before[k] ?? null));
}

/** Fire and forget, browser only. A failure costs nothing: the page warms the card on its first view. */
export function warmSessionCard(sessionId: string): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  try {
    void fetch(`/api/sessions/${encodeURIComponent(sessionId)}/warm-card/`, { method: 'POST', keepalive: true }).catch(
      () => undefined
    );
  } catch {
    // Never let warming a card get in the way of saving a session.
  }
}
