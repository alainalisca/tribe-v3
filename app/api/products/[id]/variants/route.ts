/**
 * PUT /api/products/[id]/variants — Replace all variants for a product
 * Auth + ownership required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { getProductDetail, upsertVariants } from '@/lib/dal/products';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const { data: existing } = await getProductDetail(supabase, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    if (existing.instructor_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to manage variants for this product' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.variants || !Array.isArray(body.variants)) {
      return NextResponse.json(
        { success: false, error: 'Request body must include a variants array' },
        { status: 400 }
      );
    }

    const { data, error } = await upsertVariants(supabase, id, user.id, body.variants);

    if (error) {
      logError(error, { route: '/api/products/[id]/variants', action: 'upsert_variants' });
      return NextResponse.json({ success: false, error: 'Failed to update variants' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/[id]/variants', action: 'upsert_variants' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
