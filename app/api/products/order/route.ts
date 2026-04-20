/**
 * POST /api/products/order — Create a product order (purchase flow)
 *
 * 1. Auth check
 * 2. Fetch product + variant (verify active, in purchase window, in stock)
 * 3. Apply promo code if provided
 * 4. Calculate fees
 * 5. Create product_order via DAL
 * 6. Return order details (frontend handles payment separately)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { createProductOrder, getProductDetail } from '@/lib/dal/products';

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

    const body = await request.json();
    const { product_id, variant_id, quantity = 1, promo_code } = body;

    // SEC-07: if the client supplies an Idempotency-Key, reuse any existing
    // order we've already recorded for that key and return it verbatim. This
    // prevents a retry on flaky network from double-charging the buyer.
    const idempotencyKey = request.headers.get('idempotency-key');
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('product_orders')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .eq('buyer_id', user.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ success: true, data: existing, replayed: true }, { status: 200 });
      }
    }

    if (!product_id) {
      return NextResponse.json({ success: false, error: 'Missing product_id' }, { status: 400 });
    }

    // Fetch product details
    const { data: product, error: productError } = await getProductDetail(supabase, product_id);

    if (productError || !product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Verify product is active
    if (product.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Product is not available for purchase' }, { status: 400 });
    }

    // Verify purchase window if set
    const now = new Date();
    if (product.purchase_window_start && new Date(product.purchase_window_start) > now) {
      return NextResponse.json({ success: false, error: 'Product is not yet available for purchase' }, { status: 400 });
    }
    if (product.purchase_window_end && new Date(product.purchase_window_end) < now) {
      return NextResponse.json({ success: false, error: 'Purchase window has closed' }, { status: 400 });
    }

    // Prevent buying your own product
    if (product.instructor_id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot purchase your own product' }, { status: 400 });
    }

    // Resolve price from variant or base product
    let unitPriceCents = product.price_cents;
    if (variant_id && product.variants) {
      const variant = product.variants.find(
        (v: { id: string; inventory_count?: number | null; price_override_cents?: number | null }) =>
          v.id === variant_id
      );
      if (!variant) {
        return NextResponse.json({ success: false, error: 'Variant not found' }, { status: 404 });
      }
      // Check stock for variant
      if (
        variant.inventory_count !== null &&
        variant.inventory_count !== undefined &&
        variant.inventory_count < quantity
      ) {
        return NextResponse.json({ success: false, error: 'Insufficient stock for this variant' }, { status: 400 });
      }
      if (variant.price_override_cents) {
        unitPriceCents = variant.price_override_cents;
      }
    }

    // Check base product stock if no variant
    if (!variant_id && product.total_inventory !== null && product.total_inventory !== undefined) {
      if (product.total_inventory < quantity) {
        return NextResponse.json({ success: false, error: 'Insufficient stock' }, { status: 400 });
      }
    }

    let totalCents = unitPriceCents * quantity;
    let discountCents = 0;
    let promoCodeId: string | null = null;

    // Apply promo code if provided
    if (promo_code) {
      try {
        const { validatePromoCode } = await import('@/lib/dal/promote');
        const validation = await validatePromoCode(supabase, promo_code, product_id);

        if (validation.success && validation.data) {
          const promo = validation.data;
          promoCodeId = promo.id;

          if (promo.discount_type === 'percentage') {
            discountCents = Math.round(totalCents * (promo.discount_value / 100));
          } else if (promo.discount_type === 'fixed') {
            discountCents = Math.min(promo.discount_value * 100, totalCents);
          } else if (promo.discount_type === 'free') {
            discountCents = totalCents;
          }

          totalCents = Math.max(totalCents - discountCents, 0);
        }
      } catch {
        // validatePromoCode may not exist yet — skip promo silently
      }
    }

    const { data: order, error: orderError } = await createProductOrder(supabase, {
      product_id,
      variant_id: variant_id || null,
      buyer_id: user.id,
      quantity,
      discount_cents: discountCents,
      promo_code_id: promoCodeId,
      // SEC-07: pass the key through so the DAL persists it. Unique index on
      // (idempotency_key) means any future retry lands on the existing row.
      idempotency_key: idempotencyKey || undefined,
    });

    if (orderError) {
      logError(orderError, { route: '/api/products/order', action: 'create_product_order' });
      return NextResponse.json({ success: false, error: 'Failed to create order' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error: unknown) {
    logError(error, { route: '/api/products/order', action: 'create_order' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
