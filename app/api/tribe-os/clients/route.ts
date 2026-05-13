/**
 * /api/tribe-os/clients
 *   POST  — create a client on the caller's roster
 *   GET   — list the caller's clients (with optional ?search= and ?tag=)
 *
 * Both gated by Tribe.OS premium via requireTribeOSPremium().
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { createClient as dalCreateClient, listClients } from '@/lib/dal/clients';
import { CreateClientInputSchema, ListClientsQuerySchema } from '@/lib/validations/clients';
import { notifyClientAdded } from '@/lib/email/notifyClientAdded';
import { ZodError } from 'zod';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
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

    let parsed;
    try {
      parsed = CreateClientInputSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    // Pass full tenant context: gym_id (when available) becomes the
    // new source of truth, instructor_user_id stays populated for the
    // legacy RLS branch and any code still reading it. Brand-new
    // signups without a gym yet (very rare post-Mission-6, but
    // possible) fall through with gymId = null and the legacy path.
    const result = await dalCreateClient(
      supabase,
      { gymId: gymId ?? null, instructorUserId: userId },
      {
        name: parsed.name,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        notes: parsed.notes ?? null,
        tags: parsed.tags ?? [],
        contact_info: parsed.contact_info ?? null,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'create_failed' }, { status: 500 });
    }

    // Bridge to /my-coach: if the new client's email matches a Tribe
    // user, send them a welcome email pointing at their training
    // dashboard. Awaited so we get observability in Vercel logs, but
    // the function swallows failures so a slow Resend never blocks
    // the coach's create response. Bulk import deliberately skips
    // this — 200 welcome emails on a CSV import is spam-territory.
    if (result.data && gymId) {
      await notifyClientAdded({
        client: { name: result.data.name, email: result.data.email ?? null },
        gymId,
        actorUserId: userId,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/clients' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const queryRaw = {
      search: url.searchParams.get('search') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
    };

    let parsed;
    try {
      parsed = ListClientsQuerySchema.parse(queryRaw);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    // Prefer gym context when available — listClients scopes by gym_id
    // for multi-coach correctness. Without a gym, fall through to the
    // legacy instructor_user_id path.
    const result = await listClients(
      supabase,
      { gymId: gymId ?? null, instructorUserId: userId },
      {
        searchQuery: parsed.search,
        tag: parsed.tag,
        status: parsed.status,
        sort: parsed.sort,
      }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
