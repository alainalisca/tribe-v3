import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/venues/photo?ref=PHOTO_REFERENCE
 * Proxy for Google Places photos to avoid exposing API key to clients.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref) {
    return NextResponse.json({ error: 'Missing photo reference' }, { status: 400 });
  }

  // T1-8: this proxy spends our Google Places billing on every call and was
  // previously unauthenticated + unthrottled — an attacker could loop it to
  // run up cost. Cap per-IP. Service role is needed for the rate_limits write
  // (deny-by-default RLS). Cache-Control below already lets the CDN absorb
  // legitimate repeat loads, so a modest per-minute cap won't hurt real users.
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { allowed } = await checkRateLimit(rateLimitClient, `venue-photo:${ip}`, 60, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${encodeURIComponent(ref)}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
