/**
 * T-AV30 (P1-3). Normalizes what a coach types into the "Book a free call"
 * field. Mirrors the database CHECK (migration 8002): https only, no spaces or
 * quotes, at most 500 characters.
 *
 *   ''                          -> null      (no link, no button)
 *   'calendly.com/salomon'      -> 'https://calendly.com/salomon'
 *   'https://calendly.com/x'    -> unchanged
 *   'http://...', 'javascript:' -> 'invalid'
 */
export const CALL_LINK_MAX = 500;

export function normalizeCallLink(raw: string | null | undefined): string | null | 'invalid' {
  const v = (raw ?? '').trim();
  if (v === '') return null;
  let url: string;
  if (/^https:\/\//i.test(v)) url = 'https://' + v.slice(8);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(v))
    return 'invalid'; // any other scheme: http:, javascript:, mailto:
  else url = `https://${v}`;
  if (!/^https:\/\/[^\s<>"]+$/.test(url) || url.length > CALL_LINK_MAX) return 'invalid';
  // A host needs a dot: "https://calendly" is a typo, not a page.
  const host = url.slice(8).split(/[/?#]/)[0];
  if (!host.includes('.')) return 'invalid';
  return url;
}
