/**
 * T-PAY2: split an instructor's free-text payment instructions into plain text
 * and link segments, so a pasted Bold / Wompi / Mercado Pago link is tappable.
 *
 * Pure and render-agnostic: callers turn segments into React nodes. Never
 * render the input as HTML.
 *
 * Only http(s) URLs (and bare www. domains, which get https://) become links.
 * Any other scheme (javascript:, data:, file:, ...) is never matched, so it
 * stays plain text. Every href is re-parsed with URL and must come out http(s).
 */

export type PaymentTextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

// A candidate starts with http://, https:// or www. and runs to the next
// whitespace or obvious delimiter. The lookbehind stops matches glued onto a
// word, a path, or an email (e.g. "xhttps://", "a/www.", "me@www.").
const CANDIDATE = /(?<![\w@./-])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', '¡', '¿', '»', '…']);

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/** Strip sentence punctuation off the end, keeping a balanced closing ) or ]. */
function trimTrailing(url: string): string {
  let out = url;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (!TRAILING_PUNCTUATION.has(last)) break;
    if (last === ')' && count(out, '(') >= count(out, ')')) break;
    if (last === ']' && count(out, '[') >= count(out, ']')) break;
    out = out.slice(0, -1);
  }
  return out;
}

/** Returns a safe absolute http(s) href for a matched candidate, or null. */
function toSafeHref(candidate: string): string | null {
  const withScheme = /^www\./i.test(candidate) ? `https://${candidate}` : candidate;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function linkifyPaymentText(input: string): PaymentTextSegment[] {
  const segments: PaymentTextSegment[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') prev.value += value;
    else segments.push({ type: 'text', value });
  };

  let cursor = 0;
  for (const match of input.matchAll(CANDIDATE)) {
    const start = match.index ?? 0;
    const url = trimTrailing(match[0]);
    const href = url ? toSafeHref(url) : null;
    if (!href) continue; // left in place; picked up as text below
    pushText(input.slice(cursor, start));
    segments.push({ type: 'link', value: url, href });
    cursor = start + url.length;
  }
  pushText(input.slice(cursor));
  return segments;
}

/** The first valid payment link in the text, or null. */
export function firstPaymentLink(input: string): string | null {
  const link = linkifyPaymentText(input).find((s) => s.type === 'link');
  return link && link.type === 'link' ? link.href : null;
}
