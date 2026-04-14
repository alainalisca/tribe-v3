import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import SessionShareClient from './SessionShareClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.tribesocial.co';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from('sessions')
    .select(
      'id, title, sport, date, time, start_time, location_name, location_lat, location_lng, price, price_cents, currency, max_participants, creator:users!sessions_creator_id_fkey(name, avatar_url)'
    )
    .eq('id', id)
    .single();

  if (!session) {
    return {
      title: 'Session Not Found | Tribe',
      description: 'This session is no longer available on Tribe.',
    };
  }

  const raw = session as any;
  const creator = Array.isArray(raw.creator) ? raw.creator[0] : raw.creator;

  // Neighborhood detection
  let neighborhoodName: string | null = null;
  if (raw.location_lat && raw.location_lng) {
    const hood =
      detectNeighborhood(raw.location_lat, raw.location_lng) ||
      getNearestNeighborhood(raw.location_lat, raw.location_lng);
    neighborhoodName = hood?.name ?? null;
  }

  // Price display
  const isFree = !raw.price && !raw.price_cents;
  const priceDisplay = isFree
    ? 'Free'
    : raw.price_cents
      ? `$${(raw.price_cents / 100).toLocaleString()} ${raw.currency || 'COP'}`
      : `$${raw.price?.toLocaleString()} ${raw.currency || 'COP'}`;

  // Date display
  const dateDisplay = new Date(raw.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const description = [
    raw.sport,
    creator?.name ? `with ${creator.name}` : null,
    neighborhoodName ? `in ${neighborhoodName}` : null,
    dateDisplay,
    priceDisplay,
  ]
    .filter(Boolean)
    .join(' · ');

  // OG image URL
  const ogParams = new URLSearchParams({
    type: 'session',
    title: raw.title,
    sport: raw.sport || '',
    date: dateDisplay,
    price: priceDisplay,
    instructor: creator?.name || '',
    avatar: creator?.avatar_url || '',
    neighborhood: neighborhoodName || '',
  });

  const ogImageUrl = `${BASE_URL}/api/og?${ogParams.toString()}`;

  return {
    title: `${raw.title} | Tribe`,
    description,
    openGraph: {
      title: raw.title,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/s/${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: raw.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: raw.title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function PublicSessionPage() {
  return <SessionShareClient />;
}
