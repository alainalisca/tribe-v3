/**
 * GET /api/products/download/[orderId] — Generate a signed download URL for digital products
 *
 * 1. Auth check
 * 2. Verify buyer_id matches auth user
 * 3. Verify payment_status === 'approved'
 * 4. Fetch product.digital_file_url
 * 5. Generate signed URL from Supabase Storage (5 min expiry)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { getProductDetail } from '@/lib/dal/products';

type RouteParams = { params: Promise<{ orderId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { orderId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Only the buyer can download
    if (order.buyer_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Not authorized to download this file' }, { status: 403 });
    }

    // Payment must be approved
    if (order.payment_status !== 'approved') {
      return NextResponse.json(
        { success: false, error: 'Payment must be completed before downloading' },
        { status: 402 }
      );
    }

    // Fetch the product to get digital_file_url
    const { data: product, error: productError } = await getProductDetail(supabase, order.product_id);

    if (productError || !product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    if (!product.digital_file_url) {
      return NextResponse.json(
        { success: false, error: 'No digital file available for this product' },
        { status: 404 }
      );
    }

    // Generate signed URL (300 seconds = 5 minutes)
    const { data: signedUrlData, error: storageError } = await supabase.storage
      .from('digital-products')
      .createSignedUrl(product.digital_file_url, 300);

    if (storageError || !signedUrlData?.signedUrl) {
      logError(storageError, { route: '/api/products/download/[orderId]', action: 'create_signed_url' });
      return NextResponse.json({ success: false, error: 'Failed to generate download link' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { download_url: signedUrlData.signedUrl } });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/download/[orderId]', action: 'download' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
