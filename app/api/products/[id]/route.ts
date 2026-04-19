/**
 * GET    /api/products/[id] — Single product detail (public for active products)
 * PATCH  /api/products/[id] — Update product (auth + ownership)
 * DELETE /api/products/[id] — Archive product (auth + ownership, no hard delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { getProductDetail, updateProduct, archiveProduct } from '@/lib/dal/products';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await getProductDetail(supabase, id);

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/[id]', action: 'get_product_detail' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
      return NextResponse.json({ success: false, error: 'Not authorized to edit this product' }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await updateProduct(supabase, id, user.id, body);

    if (error) {
      logError(error, { route: '/api/products/[id]', action: 'update_product' });
      return NextResponse.json({ success: false, error: 'Failed to update product' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/[id]', action: 'update_product' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
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
      return NextResponse.json({ success: false, error: 'Not authorized to delete this product' }, { status: 403 });
    }

    const { error } = await archiveProduct(supabase, id, user.id);

    if (error) {
      logError(error, { route: '/api/products/[id]', action: 'archive_product' });
      return NextResponse.json({ success: false, error: 'Failed to archive product' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Product archived' });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/[id]', action: 'archive_product' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
