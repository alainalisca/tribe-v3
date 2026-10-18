import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { SITE_URL } from '@/lib/http/siteUrl';
import { loadPublicSession } from '@/lib/session/publicSession';
import { viewerCanSeeTestSession } from '@/lib/session/testSessionAccess';
import { shareImageOrigin } from '@/lib/http/shareImageOrigin';
import {
  sessionCardVersion,
  sessionShareDescription,
  sharesAsHomeCard,
  cancelledShareText,
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

/** One read per request, shared with the page (lib/session/publicSession.ts). */
const load = loadPublicSession;

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
  // T-JOIN1b: a test session tells a scraper nothing, not even its title.
  if (!loaded || loaded.row.is_test) {
    return {
      title: 'Entrenamiento no disponible | Tribe',
      description: 'Este entrenamiento ya no está disponible en Tribe.',
      robots: { index: false, follow: false },
    };
  }
  const { row, partnerName, host } = loaded;
  const cancelled = row.status === 'cancelled';
  // T-JOIN1b: a cancelled session says so when shared, and points at the host.
  const { title, description } = cancelled
    ? cancelledShareText(row, 'es')
    : {
        title: publicSessionTitle({ title: row.title, sport: row.sport, creatorName: row.creator_name }, 'es'),
        description: sessionShareDescription(row, partnerName),
      };
  // The card on a preview's own host there, tribelatam.com in production.
  const image = `${shareImageOrigin()}/session/${id}/card/?v=${sessionCardVersion(row, partnerName, host)}`;
  // Warm the card while the scraper reads this page: its next request is the
  // image, and a cold render (3.1 s measured) can outlast WhatsApp's patience.
  try {
    // Nothing of its own to warm for a cancelled session: it shares as the home card.
    if (!cancelled)
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
    // T-JOIN1b: a cancelled session stays up for whoever has the link, out of search.
    ...(cancelled ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SessionLayout({ params, children }: Props) {
  const { id } = await params;
  const loaded = await load(id);
  // T-JOIN1b: a test session is a 404 for everyone but its host and the admins.
  if (loaded?.row.is_test && !(await viewerCanSeeTestSession(loaded.row.creator_id))) notFound();
  // No Event for a test or a cancelled session: nothing to attend.
  const jsonLd =
    loaded && !sharesAsHomeCard(loaded.row)
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
