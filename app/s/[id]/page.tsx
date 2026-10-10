import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import {
  cardDateTimeLabel,
  cardHeadline,
  cardPriceLabel,
  cardSpotsLabel,
  cardVenueLabel,
  sessionCardDescription,
  sessionCardTitle,
} from '@/lib/share/cardCopy';
import SessionShareClient, { type InitialSession } from './SessionShareClient';
import { SITE_URL } from '@/lib/http/siteUrl';
import { serializeJsonLd, sessionEventJsonLd, sessionJsonLdInputFromRow } from '@/lib/seo/jsonLd';

const BASE_URL = SITE_URL;

interface PageProps {
  params: Promise<{ id: string }>;
}

// Fetch once on the server, reuse for both generateMetadata and the page
// itself. The client used to refetch the same row on mount — a wasted round-
// trip plus a "Loading..." flash on a viral share page. Now we pass the row
// down as a prop and the client only fetches what the server can't (auth
// user + live participant count).
async function fetchSession(id: string) {
  const supabase = await createClient();
  // Column names match supabase/schema.sql: start_time (not "time"),
  // location (not "location_name"), price_cents (no separate "price").
  // The old select referenced non-existent columns; PostgREST returned an
  // error that this code silently dropped, so every shared link rendered
  // "Session not found".
  // RLS-H4: read the anon-facing view. It has no FK, so the
  // creator:users!fk embed cannot resolve — the host is exposed as the flattened
  // creator_* columns and remapped to the { creator } shape the client expects.
  const { data, error } = await supabase
    .from('sessions_public')
    .select(
      'id, title, sport, description, date, start_time, end_time, status, location, location_lat, location_lng, price_cents, currency, max_participants, current_participants, photos, creator_id, creator_name, creator_avatar_url, creator_average_rating'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[/s/[id]] fetchSession error', { id, error: error.message });
    return null;
  }
  if (!data) return null;
  const raw = data as Record<string, unknown> & {
    creator_id: string | null;
    creator_name: string | null;
    creator_avatar_url: string | null;
    creator_average_rating: number | null;
  };
  return {
    ...raw,
    creator: {
      id: raw.creator_id,
      name: raw.creator_name,
      avatar_url: raw.creator_avatar_url,
      average_rating: raw.creator_average_rating,
    },
  } as unknown as InitialSession;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await fetchSession(id);

  if (!session) {
    return {
      title: 'Entrenamiento no disponible | Tribe',
      description: 'Este entrenamiento ya no está disponible en Tribe.',
    };
  }

  const creator = session.creator;

  // Neighborhood detection
  let neighborhoodName: string | null = null;
  if (session.location_lat && session.location_lng) {
    const hood =
      detectNeighborhood(session.location_lat, session.location_lng) ||
      getNearestNeighborhood(session.location_lat, session.location_lng);
    neighborhoodName = hood?.name ?? null;
  }

  const row = session as unknown as {
    photos?: string[] | null;
    location?: string | null;
    start_time?: string | null;
    max_participants?: number | null;
    current_participants?: number | null;
  };

  // The host's first session photo becomes the share-card hero when present;
  // the OG route validates it loads and falls back to the coach's avatar.
  const sessionImage = Array.isArray(row.photos) && row.photos[0] ? row.photos[0] : '';

  // ONE headline, resolved once. This is the HYROX HYROX fix: the card used to
  // be handed `title` AND `sport` as separate params and drew both, so a
  // session whose title IS its sport printed the word twice. cardHeadline owns
  // that choice now and `sport` is no longer sent at all.
  const displayTitle = cardHeadline({ title: session.title, sport: session.sport });

  // Spanish throughout: a scraper sends no session and no language we act on,
  // and this app's market is Colombia. Same reasoning as /g/[id]'s subtitle.
  const priceDisplay = cardPriceLabel(session.price_cents, session.currency);
  const dateDisplay = cardDateTimeLabel(session.date, row.start_time);
  const venueDisplay = cardVenueLabel(row.location, neighborhoodName);
  const spotsDisplay = cardSpotsLabel(row.max_participants, row.current_participants);

  const description = sessionCardDescription({
    title: session.title,
    sport: session.sport,
    date: session.date,
    priceCents: session.price_cents,
    currency: session.currency,
    instructorName: creator?.name,
    venue: row.location,
    neighborhood: neighborhoodName,
  });
  const ogTitle = sessionCardTitle({
    title: session.title,
    sport: session.sport,
    instructorName: creator?.name,
  });

  // OG image URL. No `sport` param: see the headline note above.
  const ogParams = new URLSearchParams({
    type: 'session',
    title: displayTitle,
    date: dateDisplay,
    price: priceDisplay,
    spots: spotsDisplay,
    venue: venueDisplay,
    instructor: creator?.name || '',
    avatar: creator?.avatar_url || '',
    image: sessionImage,
  });

  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  const ogImageUrl = `${BASE_URL}/api/og/?${ogParams.toString()}`;

  return {
    title: `${ogTitle} | Tribe`,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/s/${id}/`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: ogTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicSessionPage({ params }: PageProps) {
  const { id } = await params;
  const initialSession = await fetchSession(id);
  // T-GROW5a: schema.org Event for search. Built from the same sessions_public
  // row the page renders, so it cannot say more than the page does.
  const jsonLd = initialSession
    ? sessionEventJsonLd(
        sessionJsonLdInputFromRow(initialSession as unknown as Record<string, unknown>, `${BASE_URL}/s/${id}/`)
      )
    : null;
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      )}
      <SessionShareClient initialSession={initialSession} sessionId={id} />
    </>
  );
}
