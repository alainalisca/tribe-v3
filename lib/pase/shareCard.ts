import type { Metadata } from 'next';
import type { PassConfig } from '@/lib/dal/passLeads';

import { SITE_URL } from '@/lib/http/siteUrl';

const BASE_URL = SITE_URL;

/**
 * The link-preview card for a pass, i.e. what WhatsApp, iMessage and Instagram
 * DMs render when the /pase/ URL is pasted.
 *
 * WHY THIS EXISTS. Until 2026-10-06 generateMetadata set only a title, so
 * every scraper inherited the root layout's openGraph block and the BullBox
 * pass previewed as a generic "Tribe - Never Train Alone" card. The page leads
 * with the partner's brand (see PartnerHero), and the card has to match it:
 * the person receiving the link is being invited to BullBox, not to Tribe.
 *
 * Next merges metadata SHALLOWLY, so declaring openGraph and twitter here
 * replaces the root's blocks entirely. Omitting either one lets that platform
 * fall back to the Tribe card again.
 *
 * The image is the /api/og SPLIT card — the same construction /g/[id] uses,
 * with one deliberate difference in what is the star.
 *
 * T-GROW3b: THE PASS LEADS WITH THE OFFER, THE GYM PAGE LEADS WITH THE NAME.
 * Until 2026-10-08 this sent type=gym with title = partner name and the
 * headline demoted to a subtitle, so the biggest words on a pass preview were
 * the gym's name — which the logo beside them already says — and the reason to
 * tap ("Tu primera clase gratis") was set small underneath. The split card
 * carries the logo, so the name is never missing; the headline takes the
 * display size and gets the accent rule under it. type=pass is what selects
 * that emphasis. See _og_review/mock_B_split.png.
 *
 * robots noindex stays: link-preview scrapers ignore it, search engines obey.
 */
export function passShareCard(config: PassConfig): Pick<Metadata, 'openGraph' | 'twitter'> {
  const headline = config.headline ?? 'Tu primera clase gratis';
  const description = passShareDescription(config);
  const ogParams = new URLSearchParams({
    type: 'pass',
    title: headline,
    // What the partner does, then where they are — the two supporting lines in
    // the mock. `sub` is the partner's own sentence, so it is trimmed to a
    // length that still sets on one or two lines at card size.
    subtitle: (config.sub ?? '').slice(0, 60),
    sub2: config.address ?? '',
    avatar: config.logoUrl ?? '',
  });
  // Trailing slashes match next.config trailingSlash:true so a scraper that
  // does not follow the 308 still gets the image (same as /g/[id]).
  const ogImageUrl = `${BASE_URL}/api/og/?${ogParams.toString()}`;
  const url = `${BASE_URL}/pase/${config.slug}/`;
  const title = `${config.partnerName} | ${headline}`;

  return {
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: config.partnerName,
      url,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: config.partnerName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

/** One sentence, Spanish (a scraper sends no language), capped for previews. */
export function passShareDescription(config: PassConfig): string {
  return (config.sub || `Deja tus datos y ${config.partnerName} te escribe para agendar tu clase. Sin costo.`).slice(
    0,
    160
  );
}
