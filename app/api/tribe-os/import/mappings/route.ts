import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const kind = req.nextUrl.searchParams.get('kind');
  if (!kind || !['members', 'visits'].includes(kind)) {
    return NextResponse.json({ success: false, error: 'invalid_kind' }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from('gym_import_mappings')
      .select('mapping')
      .eq('gym_id', gymId)
      .eq('kind', kind)
      .eq('name', 'default')
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? null });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/import/mappings' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

const SaveBody = z.object({
  kind: z.enum(['members', 'visits']),
  mapping: z.record(z.string(), z.string()),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = SaveBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { error } = await supabase.from('gym_import_mappings').upsert(
      {
        gym_id: gymId,
        kind: parsed.data.kind,
        name: 'default',
        mapping: parsed.data.mapping,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gym_id,kind,name' }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/import/mappings' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
