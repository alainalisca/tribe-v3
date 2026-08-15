/**
 * Page: /invite/[token] — server half. Exists so shared invite links preview
 * with real session details (iMessage/WhatsApp scrapers only see server
 * metadata; the old client-only page inherited the generic root-layout card).
 * Mirrors the /s/[id] pattern: one server fetch reused by generateMetadata and
 * the page body, passed down as a prop so the client does not refetch.
 * Everything interactive (Gate 1 dual affordance, join handlers) lives in
 * InviteClient.
 */
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import { formatTime12Hour } from '@/lib/utils';
import InviteClient, { type InitialInvite } from './InviteClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tribe-v3.vercel.app';

interface PageProps {
  params: Promise<{ token: string }>;
}

// Fetch once on the server, reuse for both generateMetadata and the page
// itself (same motivation as /s/[id]: no client refetch, no loading flash).
// Order matters: validate_invite_token FIRST — possessing the token IS the
// authorization (RLS-H2), and the definer RPC returns the safe session
// projection (migration 141 added creator_id). Only then read the anon-facing
// sessions_public view for display fields the RPC does not return, with an
// EXPLICIT column list — never select('*').
async function fetchInvite(token: string): Promise<InitialInvite | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('validate_invite_token', { p_token: token });
  if (error) {
    // Transient failure — return null so the client falls back to its own
    // fetch instead of rendering a false "not found".
    console.error('[/invite/[token]] fetchInvite rpc error', { error: error.message });
    return null;
  }
  const invite = (typeof data === 'string' ? JSON.parse(data) : data) as InitialInvite | null;
  if (!invite) return null;
  if (!invite.valid || !invite.session?.id) return invite;

  // Display-only enrichment: the session photo + HOST name/avatar from the
  // anon-facing view, and the INVITER resolved from created_by. The inviter
  // and the host differ routinely (D7 Option B: confirmed participants mint
  // tokens too), so both are fetched — the card leads with the inviter.
  // Failures here degrade to a photo-less/nameless card, never a dead page.
  const [publicRes, inviterRes] = await Promise.all([
    supabase
      .from('sessions_public')
      .select('id, photos, creator_name, creator_avatar_url')
      .eq('id', invite.session.id)
      .maybeSingle(),
    invite.created_by
      ? supabase.from('users').select('id, name, avatar_url').eq('id', invite.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const pub = publicRes.data as {
    photos: string[] | null;
    creator_name: string | null;
    creator_avatar_url: string | null;
  } | null;
  const inviterRow = inviterRes.data as { name: string | null; avatar_url: string | null } | null;

  return {
    ...invite,
    photos: pub?.photos ?? null,
    host: pub ? { name: pub.creator_name, avatar_url: pub.creator_avatar_url } : null,
    inviter: inviterRow ? { name: inviterRow.name, avatar_url: inviterRow.avatar_url } : null,
  };
}

// Single-locale (English) metadata, matching /s/[id] exactly — scrapers carry
// no language preference and /s/[id] already established en-US display here.
const GENERIC_METADATA: Metadata = {
  title: 'Tribe — Never Train Alone',
  description: 'Find fitness sessions, connect with athletes, and train with the best instructors in Medellín.',
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const invite = await fetchInvite(token);

  // Invalid, expired, and fetch-failure all return the IDENTICAL generic card:
  // a link preview must not become an oracle for whether a token exists or has
  // merely expired.
  if (!invite || !invite.valid || !invite.session) {
    return GENERIC_METADATA;
  }

  const session = invite.session;

  // Neighborhood from the RPC's 3-decimal-rounded coords (~110 m) — the
  // precise street address (session.location) is deliberately NOT exposed.
  let neighborhoodName: string | null = null;
  if (session.location_lat && session.location_lng) {
    const hood =
      detectNeighborhood(session.location_lat, session.location_lng) ||
      getNearestNeighborhood(session.location_lat, session.location_lng);
    neighborhoodName = hood?.name ?? null;
  }

  const dateDisplay = new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeDisplay = session.start_time ? formatTime12Hour(session.start_time) : '';
  const dateTimeDisplay = timeDisplay ? `${dateDisplay} · ${timeDisplay}` : dateDisplay;

  // title is nullable; fall back to sport so cards never render "null".
  const displayTitle = session.title || session.sport;
  const inviterName = invite.inviter?.name || null;

  // Lead with the INVITER (created_by), not the instructor — the personal
  // "X invited you" is the hook on this route.
  const description = [
    inviterName ? `${inviterName} invited you` : 'You are invited',
    session.sport,
    neighborhoodName ? `in ${neighborhoodName}` : null,
    dateTimeDisplay,
  ]
    .filter(Boolean)
    .join(' · ');

  const sessionImage = Array.isArray(invite.photos) && invite.photos[0] ? invite.photos[0] : '';

  // Derived display fields ONLY — the invite token must never appear in any
  // query string (scraper caches and edge logs keep OG image URLs).
  const ogImageParams = new URLSearchParams({
    type: 'session',
    title: displayTitle,
    sport: session.sport || '',
    date: dateTimeDisplay,
    instructor: inviterName || '',
    avatar: invite.inviter?.avatar_url || '',
    neighborhood: neighborhoodName || '',
    image: sessionImage,
  });

  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  const ogImageUrl = `${BASE_URL}/api/og/?${ogImageParams.toString()}`;

  return {
    title: `${displayTitle} | Tribe`,
    description,
    // openGraph.url is deliberately omitted: the canonical invite URL contains
    // the token, and metadata should carry no copy of it.
    openGraph: {
      title: displayTitle,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: displayTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: displayTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const initialInvite = await fetchInvite(token);
  return <InviteClient token={token} initialInvite={initialInvite} />;
}
