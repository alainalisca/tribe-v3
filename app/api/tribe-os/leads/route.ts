import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { normalizePhone, isValidPhone, computeFollowUp } from '@/lib/tribe-os/leads/helpers';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  FULL_NAME_MAX,
  INTEREST_MAX,
  EMAIL_MAX,
  PHONE_REGEX,
  EMAIL_REGEX,
} from '@/lib/tribe-os/leads/constants';
import type { LeadSource, LeadStatus } from '@/lib/tribe-os/leads/constants';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as LeadStatus | null;
    const search = url.searchParams.get('search')?.trim() || null;

    let query = supabase
      .from('tribe_os_leads')
      .select('*')
      .eq('gym_id', gymId)
      .order('updated_at', { ascending: false });

    if (status && LEAD_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      logError(error, { route: 'GET /api/tribe-os/leads', gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/leads' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
    const source = typeof b.source === 'string' ? b.source : '';
    const phone = typeof b.phone === 'string' ? normalizePhone(b.phone) : null;
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : null;
    const interest = typeof b.interest === 'string' ? b.interest.trim() : null;
    const referredBy = typeof b.referred_by_client_id === 'string' ? b.referred_by_client_id : null;

    if (!fullName || fullName.length > FULL_NAME_MAX) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }
    if (!LEAD_SOURCES.includes(source as LeadSource)) {
      return NextResponse.json({ success: false, error: 'invalid_source' }, { status: 400 });
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      return NextResponse.json({ success: false, error: 'invalid_phone' }, { status: 400 });
    }
    if (email && (!EMAIL_REGEX.test(email) || email.length > EMAIL_MAX)) {
      return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
    }
    if (interest && interest.length > INTEREST_MAX) {
      return NextResponse.json({ success: false, error: 'invalid_interest' }, { status: 400 });
    }

    const now = new Date();
    const nextFollowUp = computeFollowUp('new', now, null);

    const { data, error } = await supabase
      .from('tribe_os_leads')
      .insert({
        gym_id: gymId,
        full_name: fullName,
        source,
        phone: phone || null,
        email: email || null,
        interest: interest || null,
        referred_by_client_id: referredBy,
        status: 'new',
        next_follow_up_at: nextFollowUp,
        created_by: userId,
        assigned_to: userId,
      })
      .select()
      .single();

    if (error) {
      logError(error, { route: 'POST /api/tribe-os/leads', gymId, userId });
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'duplicate_phone' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'create_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/leads' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
