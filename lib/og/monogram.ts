import { initialsOf } from '@/lib/text/initials';

/**
 * T-OG2. The letters a split share card (/api/og, type pass | gym | instructor)
 * shows in its hero when the partner or person has no logo or photo.
 *
 * They stand for WHO, never for the headline. A pass card's headline is the
 * offer ("Tu primera clase gratis"), so building initials from it put "TP" on
 * every logo-less partner's WhatsApp preview while the pass page itself showed
 * the partner's own letters. Callers send the name as `monogram`; the headline
 * is only the fallback for an old URL that predates the param (cached previews
 * keep their URL for days).
 *
 * One helper, initialsOf, for every monogram in the app: the route used to
 * carry its own copy, which took each word's first CHARACTER and so rendered
 * "BullBox (Prueba)" as "B(", the bug T-AV28 had already fixed everywhere else.
 */
export function splitMonogram(monogram: string, headline: string): string {
  return initialsOf(monogram.trim() || headline, 2);
}
