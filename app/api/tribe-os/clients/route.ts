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
import { ZodError } from 'zod';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

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

    const result = await dalCreateClient(supabase, userId, {
      name: parsed.name,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      notes: parsed.notes ?? null,
      tags: parsed.tags ?? [],
      contact_info: parsed.contact_info ?? null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'create_failed' }, { status: 500 });
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
  const { supabase, userId } = gate;

  try {
    const url = new URL(request.url);
    const queryRaw = {
      search: url.searchParams.get('search') ?? undefined,
      tag: url.searchParams.get('tag') ?? undefined,
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

    const result = await listClients(supabase, userId, {
      searchQuery: parsed.search,
      tag: parsed.tag,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
