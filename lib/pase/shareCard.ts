import type { Metadata } from 'next';
import type { PassConfig } from '@/lib/dal/passLeads';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tribe-v3.vercel.app';

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
 * The image is the SAME /api/og gym card /g/[id] uses, so a partner's pass
 * and their public page preview identically and there is one card template to
 * maintain. Title = partner name, subtitle = the pass headline, square = logo.
 * robots noindex stays: link-preview scrapers ignore it, search engines obey.
 */
export function passShareCard(config: PassConfig): Pick<Metadata, 'openGraph' | 'twitter'> {
  const headline = config.headline ?? 'Tu primera clase gratis';
  const description = passShareDescription(config);
  const ogParams = new URLSearchParams({
    type: 'gym',
    title: config.partnerName,
    subtitle: headline,
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
