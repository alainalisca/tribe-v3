// Data Access Layer — Product Storefront athlete-side operations
// Split from products.ts to stay under 300 lines

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { calculateFees } from '@/lib/payments/config';

import type { DalResult } from './types';
import type { Product, ProductWithVariants, ProductOrderWithProduct, CreateOrderData } from './product-types';

/** Get active storefront products for an instructor, respecting purchase windows. */
export async function getStorefrontProducts(
  supabase: SupabaseClient,
  instructorId: string
): Promise<DalResult<Product[]>> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('instructor_id', instructorId)
      .eq('status', 'active')
      .or(`purchase_window_start.is.null,purchase_window_start.lte.${now}`)
      .or(`purchase_window_end.is.null,purchase_window_end.gte.${now}`)
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'getStorefrontProducts', instructorId });
    return { success: false, error: 'Failed to fetch storefront products' };
  }
}

/** Get a single product with its variants. */
export async function getProductDetail(
  supabase: SupabaseClient,
  productId: string
): Promise<DalResult<ProductWithVariants>> {
  try {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', productId).single();

    if (error) return { success: false, error: error.message };

    const { data: variants } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    return {
      success: true,
      data: { ...product, variants: variants || [] } as ProductWithVariants,
    };
  } catch (error) {
    logError(error, { action: 'getProductDetail', productId });
    return { success: false, error: 'Failed to fetch product detail' };
  }
}

/** Create a product order. Computes fees, checks inventory, decrements stock. */
export async function createProductOrder(
  supabase: SupabaseClient,
  orderData: CreateOrderData
): Promise<DalResult<{ id: string }>> {
  try {
    // 1. Fetch product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', orderData.product_id)
      .eq('status', 'active')
      .single();

    if (prodErr || !product) {
      return { success: false, error: 'Product not found or unavailable' };
    }

    // 2. Determine unit price (variant override or product price)
    let unitPriceCents = product.price_cents;
    let variantLabel: string | null = null;

    if (orderData.variant_id) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('*')
        .eq('id', orderData.variant_id)
        .eq('product_id', orderData.product_id)
        .single();

      if (!variant) return { success: false, error: 'Variant not found' };

      if (variant.price_override_cents != null) {
        unitPriceCents = variant.price_override_cents;
      }
      variantLabel = variant.label;

      // Check variant inventory
      if (variant.inventory_count != null && variant.inventory_count < orderData.quantity) {
        return { success: false, error: 'Insufficient variant inventory' };
      }
    }

    // 3. Check product-level inventory
    if (product.track_inventory && product.total_inventory != null) {
      if (product.total_inventory < orderData.quantity) {
        return { success: false, error: 'Insufficient inventory' };
      }
    }

    // 4. Calculate totals and fees
    const quantity = orderData.quantity || 1;
    const discount = orderData.discount_cents || 0;
    const totalPriceCents = unitPriceCents * quantity - discount;
    const { platformFeeCents, instructorPayoutCents } = calculateFees(totalPriceCents);

    // 5. Build credits fields for packages
    let creditsRemaining: number | null = null;
    let creditsExpireAt: string | null = null;

    if (product.product_type === 'package' && product.session_credits) {
      creditsRemaining = product.session_credits * quantity;
      if (product.package_valid_days) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + product.package_valid_days);
        creditsExpireAt = expiry.toISOString();
      }
    }

    // 6. Insert order
    const { data: order, error: orderErr } = await supabase
      .from('product_orders')
      .insert({
        buyer_id: orderData.buyer_id,
        instructor_id: product.instructor_id,
        product_id: orderData.product_id,
        variant_id: orderData.variant_id ?? null,
        quantity,
        unit_price_cents: unitPriceCents,
        total_price_cents: totalPriceCents,
        platform_fee_cents: platformFeeCents,
        instructor_payout_cents: instructorPayoutCents,
        currency: product.currency,
        promo_code_id: orderData.promo_code_id ?? null,
        discount_cents: discount,
        payment_id: orderData.payment_id ?? null,
        variant_label: variantLabel,
        buyer_note: orderData.buyer_note ?? null,
        credits_remaining: creditsRemaining,
        credits_expire_at: creditsExpireAt,
      })
      .select('id')
      .single();

    if (orderErr) return { success: false, error: orderErr.message };

    // 7. Decrement inventory
    if (product.track_inventory && product.total_inventory != null) {
      await supabase
        .from('products')
        .update({ total_inventory: product.total_inventory - quantity })
        .eq('id', product.id);
    }

    if (orderData.variant_id) {
      const { data: variant } = await supabase
        .from('product_variants')
        .select('inventory_count')
        .eq('id', orderData.variant_id)
        .single();

      if (variant?.inventory_count != null) {
        await supabase
          .from('product_variants')
          .update({ inventory_count: variant.inventory_count - quantity })
          .eq('id', orderData.variant_id);
      }
    }

    return { success: true, data: { id: order.id } };
  } catch (error) {
    logError(error, { action: 'createProductOrder', productId: orderData.product_id });
    return { success: false, error: 'Failed to create order' };
  }
}

/** Get orders placed by a buyer, joined with product info. */
export async function getBuyerOrders(
  supabase: SupabaseClient,
  buyerId: string
): Promise<DalResult<ProductOrderWithProduct[]>> {
  try {
    const { data, error } = await supabase
      .from('product_orders')
      .select('*, product:products!product_orders_product_id_fkey(id, title, title_es, thumbnail_url, product_type)')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as ProductOrderWithProduct[] };
  } catch (error) {
    logError(error, { action: 'getBuyerOrders', buyerId });
    return { success: false, error: 'Failed to fetch buyer orders' };
  }
}
