/**
 * GET  /api/products — Fetch instructor's products (auth required)
 * POST /api/products — Create a new product (auth + instructor required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { getInstructorProducts, createProduct } from '@/lib/dal/products';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || undefined) as
      | 'active'
      | 'draft'
      | 'archived'
      | 'sold_out'
      | undefined;
    const product_type = (searchParams.get('type') || undefined) as 'physical' | 'digital' | 'package' | undefined;

    const { data, error } = await getInstructorProducts(supabase, user.id, { status, product_type });

    if (error) {
      logError(error, { route: '/api/products', action: 'get_instructor_products' });
      return NextResponse.json({ success: false, error: 'Failed to fetch products' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError(error, { route: '/api/products', action: 'get_products' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is an instructor
    const { data: profile } = await supabase.from('users').select('is_instructor').eq('id', user.id).single();

    if (!profile?.is_instructor) {
      return NextResponse.json({ success: false, error: 'Only instructors can create products' }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await createProduct(supabase, user.id, body);

    if (error) {
      logError(error, { route: '/api/products', action: 'create_product' });
      return NextResponse.json({ success: false, error: 'Failed to create product' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    logError(error, { route: '/api/products', action: 'create_product' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
