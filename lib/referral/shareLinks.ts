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
 * PASS: the spec's draft, verbatim (T-GROW2 B). EN for approval, ES ships.
 * SESSION and PROFILE: the spec gives no copy. These follow the pass draft's
 * shape and are DRAFTS FOR AL'S APPROVAL. No reward is named anywhere (Al is
 * confirming it with Leo); the /referral page's "we both earn a reward" copy is
 * deliberately not reused.
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

/** The message, with the link at the end where the spec's draft puts it. */
export function referralMessage(context: ReferralContext, link: string, language: 'en' | 'es'): string {
  const es = language === 'es';
  switch (context.kind) {
    case 'pass':
      return es
        ? `Voy a una clase gratis en ${context.partnerName} con Tribe. Vente conmigo: ${link}`
        : `I'm doing a free class at ${context.partnerName} with Tribe. Come with me: ${link}`;
    case 'session':
      return es
        ? `Voy a entrenar ${context.title} con Tribe. Vente conmigo: ${link}`
        : `I'm training ${context.title} with Tribe. Come with me: ${link}`;
    case 'profile':
      return es ? `Entreno con Tribe. Vente conmigo: ${link}` : `I train with Tribe. Come with me: ${link}`;
  }
}

/** wa.me with no number: WhatsApp opens its own contact picker with the text prefilled. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
