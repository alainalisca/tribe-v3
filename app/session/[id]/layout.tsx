import type { Metadata } from 'next';
import { cache, type ReactNode } from 'react';
import { after } from 'next/server';
import { SITE_URL } from '@/lib/http/siteUrl';
import { shareImageOrigin } from '@/lib/http/shareImageOrigin';
import {
  loadSessionForCard,
  sessionCardVersion,
  sessionShareDescription,
  type SessionCardRow,
} from '@/lib/og/sessionCard';
import { serializeJsonLd, sessionEventJsonLd, sessionJsonLdInputFromRow } from '@/lib/seo/jsonLd';
import { publicSessionPlace, publicSessionTitle } from '@/lib/share/sessionPublic';

/**
 * T-JOIN1 Part B. The session page's share metadata and Event JSON-LD, moved
 * here from /s/[id] (which now 308s to this page). A layout because the page
 * is a client component and cannot export generateMetadata.
 *
 * Everything here reaches a signed-out visitor and every scraper, so the place
 * is the partner gym or the barrio, never `location` (usually a street
 * address): in the description, in og tags and in the JSON-LD alike.
 * og:image is the session's card (lib/og/sessionCard.ts) at /session/<id>/card/.
 */
type Props = { params: Promise<{ id: string }>; children: ReactNode };

/** One read per request: the metadata and the JSON-LD share it. */
const load = cache(loadSessionForCard);

function placeOf(row: SessionCardRow, partnerName: string | null) {
  return publicSessionPlace({
    partnerName,
    partnerApproved: !!partnerName,
    lat: row.location_lat,
    lng: row.location_lng,
    location: row.location,
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const loaded = await load(id);
  if (!loaded) {
    return {
      title: 'Entrenamiento no disponible | Tribe',
      description: 'Este entrenamiento ya no está disponible en Tribe.',
    };
  }
  const { row, partnerName, host } = loaded;
  const title = publicSessionTitle({ title: row.title, sport: row.sport, creatorName: row.creator_name }, 'es');
  const description = sessionShareDescription(row, partnerName);
  // The card on a preview's own host there, tribelatam.com in production.
  const image = `${shareImageOrigin()}/session/${id}/card/?v=${sessionCardVersion(row, partnerName, host)}`;
  // Warm the card while the scraper reads this page: its next request is the
  // image, and a cold render (3.1 s measured) can outlast WhatsApp's patience.
  try {
    after(() => fetch(image, { headers: { 'user-agent': 'TribeCardWarmup/1.0' } }).catch(() => undefined));
  } catch {
    // Outside a request (tests): nothing to warm.
  }
  return {
    title: `${title} | Tribe`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${SITE_URL}/session/${id}/`,
      images: [{ url: image, width: 1200, height: 630, type: 'image/jpeg', alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function SessionLayout({ params, children }: Props) {
  const { id } = await params;
  const loaded = await load(id);
  const jsonLd = loaded
    ? sessionEventJsonLd({
        ...sessionJsonLdInputFromRow(loaded.row as unknown as Record<string, unknown>, `${SITE_URL}/session/${id}/`),
        // The city when there is neither a partner gym nor a barrio, as on the
        // share card: an Event needs a location, and the street is never shown.
        location: placeOf(loaded.row, loaded.partnerName).place ?? 'Medellín',
      })
    : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      {children}
    </>
  );
}
