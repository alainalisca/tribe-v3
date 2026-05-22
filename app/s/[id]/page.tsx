import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import SessionShareClient, { type InitialSession } from './SessionShareClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tribe-v3.vercel.app';

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
  const { data } = await supabase
    .from('sessions')
    .select(
      'id, title, sport, date, time, start_time, location_name, location_lat, location_lng, price, price_cents, currency, max_participants, photos, creator_id, creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating)'
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const raw = data as Record<string, unknown> & {
    creator: unknown;
  };
  return {
    ...raw,
    creator: Array.isArray(raw.creator) ? raw.creator[0] : raw.creator,
  } as InitialSession;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await fetchSession(id);

  if (!session) {
    return {
      title: 'Session Not Found | Tribe',
      description: 'This session is no longer available on Tribe.',
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

  // Price display
  const isFree = !session.price && !session.price_cents;
  const priceDisplay = isFree
    ? 'Free'
    : session.price_cents
      ? `$${(session.price_cents / 100).toLocaleString()} ${session.currency || 'COP'}`
      : `$${session.price?.toLocaleString()} ${session.currency || 'COP'}`;

  // Date display
  const dateDisplay = new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const description = [
    session.sport,
    creator?.name ? `with ${creator.name}` : null,
    neighborhoodName ? `in ${neighborhoodName}` : null,
    dateDisplay,
    priceDisplay,
  ]
    .filter(Boolean)
    .join(' · ');

  // The host's first session photo becomes the share-card background when
  // present; the OG route validates it loads and falls back gracefully.
  const photos = (session as { photos?: string[] | null }).photos;
  const sessionImage = Array.isArray(photos) && photos[0] ? photos[0] : '';

  // OG image URL
  const ogParams = new URLSearchParams({
    type: 'session',
    title: session.title,
    sport: session.sport || '',
    date: dateDisplay,
    price: priceDisplay,
    instructor: creator?.name || '',
    avatar: creator?.avatar_url || '',
    neighborhood: neighborhoodName || '',
    image: sessionImage,
  });

  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  const ogImageUrl = `${BASE_URL}/api/og/?${ogParams.toString()}`;

  return {
    title: `${session.title} | Tribe`,
    description,
    openGraph: {
      title: session.title,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/s/${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: session.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: session.title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicSessionPage({ params }: PageProps) {
  const { id } = await params;
  const initialSession = await fetchSession(id);
  return <SessionShareClient initialSession={initialSession} sessionId={id} />;
}
