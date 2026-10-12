/**
 * T-GROW2 B: the links and messages a "Trae a un amigo" card shares.
 *
 * Pure. The host is SITE_URL (lib/http/siteUrl.ts, https://tribelatam.com), never
 * window.location: a link built on a Vercel preview would carry the preview host,
 * which stops resolving when that deployment is pruned (T-DOMAIN1).
 *
 * EVERY LINK KEEPS ITS TRAILING SLASH (next.config trailingSlash: true). A
 * slash-less path 308s, and WhatsApp's scraper does not follow it, so the link
 * would unfurl as a bare URL with no card (lib/share.ts says the same).
 *
 * `?ref=CODE&src=referral`: lib/attribution.ts captures `ref` on every route, so
 * the code survives a friend browsing before they claim or sign up, and lands
 * on pass_leads.attr_ref (a claim) or users.signup_ref (a signup).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COPY, AND WHICH OF IT IS APPROVED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ALL THREE APPROVED BY AL, 2026-10-10, as written below (PR #201).
 * PASS: the spec's draft, verbatim (T-GROW2 B).
 * SESSION and PROFILE: the spec gave no copy; these follow the pass draft's
 * shape. No reward is named anywhere (Al is confirming it with Leo), and the
 * /referral page's "we both earn a reward" copy is deliberately not reused and
 * left untouched (Al, 2026-10-10). shareLinks.test.ts fails if a reward appears.
 *
 * Session links go to /s/{id}/, the public share route with the OG card, not
 * /session/{id}/ as the spec wrote: /s/ is what a stranger can open and what
 * WhatsApp can preview. The ref is captured there and stays sticky.
 */
import { SITE_URL } from '@/lib/http/siteUrl';

export type ReferralContext =
  | { kind: 'pass'; slug: string; partnerName: string }
  | { kind: 'session'; sessionId: string; title: string }
  | { kind: 'profile' };

function withRef(path: string, code: string): string {
  const qs = new URLSearchParams({ ref: code, src: 'referral' });
  return `${SITE_URL}${path}?${qs.toString()}`;
}

export function referralLink(context: ReferralContext, code: string): string {
  switch (context.kind) {
    case 'pass':
      return withRef(`/pase/${encodeURIComponent(context.slug)}/`, code);
    case 'session':
      return withRef(`/s/${encodeURIComponent(context.sessionId)}/`, code);
    case 'profile':
      return withRef('/', code);
  }
}

/**
 * The message, with the link at the end where the spec's draft puts it.
 * A table keyed by language rather than a ternary (the house lint rule), with
 * every context in both languages so neither can be missing one.
 */
const MESSAGES: Record<'en' | 'es', (context: ReferralContext, link: string) => string> = {
  es: (context, link) => {
    switch (context.kind) {
      case 'pass':
        return `Voy a una clase gratis en ${context.partnerName} con Tribe. Vente conmigo: ${link}`;
      case 'session':
        return `Voy a entrenar ${context.title} con Tribe. Vente conmigo: ${link}`;
      case 'profile':
        return `Entreno con Tribe. Vente conmigo: ${link}`;
    }
  },
  en: (context, link) => {
    switch (context.kind) {
      case 'pass':
        return `I'm doing a free class at ${context.partnerName} with Tribe. Come with me: ${link}`;
      case 'session':
        return `I'm training ${context.title} with Tribe. Come with me: ${link}`;
      case 'profile':
        return `I train with Tribe. Come with me: ${link}`;
    }
  },
};

export function referralMessage(context: ReferralContext, link: string, language: 'en' | 'es'): string {
  return MESSAGES[language](context, link);
}

/** wa.me with no number: WhatsApp opens its own contact picker with the text prefilled. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
