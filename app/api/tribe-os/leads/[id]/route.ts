import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { normalizePhone, computeFollowUp, nextStatusOptions } from '@/lib/tribe-os/leads/helpers';
import {
  LEAD_STATUSES,
  FULL_NAME_MAX,
  INTEREST_MAX,
  EMAIL_MAX,
  PHONE_REGEX,
  EMAIL_REGEX,
  LOST_REASON_MIN,
  LOST_REASON_MAX,
} from '@/lib/tribe-os/leads/constants';
import type { LeadStatus } from '@/lib/tribe-os/leads/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('tribe_os_leads')
      .select('*')
      .eq('id', id)
      .eq('gym_id', gymId)
      .single();

    if (error) {
      logError(error, { route: 'GET /api/tribe-os/leads/[id]', id, gymId });
      if (error.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
      }
      return NextResponse.json({ success: false, error: 'fetch_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/leads/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if ('full_name' in b) {
      const v = typeof b.full_name === 'string' ? b.full_name.trim() : '';
      if (!v || v.length > FULL_NAME_MAX) {
        return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
      }
      updates.full_name = v;
    }

    if ('phone' in b) {
      if (b.phone === null || b.phone === '') {
        updates.phone = null;
      } else {
        const p = normalizePhone(String(b.phone));
        if (!PHONE_REGEX.test(p)) {
          return NextResponse.json({ success: false, error: 'invalid_phone' }, { status: 400 });
        }
        updates.phone = p;
      }
    }

    if ('email' in b) {
      if (b.email === null || b.email === '') {
        updates.email = null;
      } else {
        const e = String(b.email).trim().toLowerCase();
        if (!EMAIL_REGEX.test(e) || e.length > EMAIL_MAX) {
          return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
        }
        updates.email = e;
      }
    }

    if ('interest' in b) {
      if (b.interest === null || b.interest === '') {
        updates.interest = null;
      } else {
        const v = String(b.interest).trim();
        if (v.length > INTEREST_MAX) {
          return NextResponse.json({ success: false, error: 'invalid_interest' }, { status: 400 });
        }
        updates.interest = v;
      }
    }

    if ('assigned_to' in b) {
      updates.assigned_to = typeof b.assigned_to === 'string' ? b.assigned_to : null;
    }

    if ('trial_at' in b) {
      updates.trial_at = typeof b.trial_at === 'string' ? b.trial_at : null;
    }

    if ('status' in b) {
      const newStatus = String(b.status) as LeadStatus;
      if (!LEAD_STATUSES.includes(newStatus)) {
        return NextResponse.json({ success: false, error: 'invalid_status' }, { status: 400 });
      }

      const { data: current, error: fetchErr } = await supabase
        .from('tribe_os_leads')
        .select('status, trial_at')
        .eq('id', id)
        .eq('gym_id', gymId)
        .single();

      if (fetchErr || !current) {
        logError(fetchErr, { route: 'PATCH /api/tribe-os/leads/[id]', id, gymId });
        return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
      }

      const allowed = nextStatusOptions(current.status as LeadStatus);
      if (!allowed.includes(newStatus)) {
        return NextResponse.json({ success: false, error: 'invalid_transition' }, { status: 400 });
      }

      if (newStatus === 'lost') {
        const reason = typeof b.lost_reason === 'string' ? b.lost_reason.trim() : '';
        if (reason.length < LOST_REASON_MIN || reason.length > LOST_REASON_MAX) {
          return NextResponse.json({ success: false, error: 'invalid_lost_reason' }, { status: 400 });
        }
        updates.lost_reason = reason;
      }

      if (newStatus === 'joined') {
        if (typeof b.converted_client_id !== 'string' || !b.converted_client_id) {
          return NextResponse.json({ success: false, error: 'converted_client_id_required' }, { status: 400 });
        }
        updates.converted_client_id = b.converted_client_id;
      }

      updates.status = newStatus;
      const now = new Date();
      const trialAt = typeof updates.trial_at === 'string'
        ? updates.trial_at
        : (current.trial_at as string | null);
      updates.next_follow_up_at = computeFollowUp(newStatus, now, trialAt);

      await supabase.from('tribe_os_lead_activities').insert({
        lead_id: id,
        gym_id: gymId,
        kind: 'status_change',
        from_status: current.status,
        to_status: newStatus,
        created_by: userId,
      });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'no_updates' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('tribe_os_leads')
      .update(updates)
      .eq('id', id)
      .eq('gym_id', gymId)
      .select()
      .single();

    if (error) {
      logError(error, { route: 'PATCH /api/tribe-os/leads/[id]', id, gymId });
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'duplicate_phone' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'update_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/leads/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
