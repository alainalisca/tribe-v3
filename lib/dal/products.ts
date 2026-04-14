// Data Access Layer for Product Storefront — instructor-side operations
// Athlete-side: ./products-storefront.ts
// Session credits: ./products-credits.ts

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

import type { DalResult } from './types';
import type {
  Product,
  ProductInsert,
  ProductUpdate,
  ProductVariant,
  ProductVariantInsert,
  ProductOrderWithDetails,
  ProductFilters,
  OrderFilters,
} from './product-types';

// Re-export all types from one place
export type { Product, ProductVariant, ProductWithVariants } from './product-types';
export type { ProductOrder, ProductOrderWithProduct, ProductOrderWithDetails } from './product-types';
export type { ProductInsert, ProductUpdate, ProductVariantInsert, CreateOrderData } from './product-types';
export type { ProductFilters, OrderFilters } from './product-types';

// Re-export athlete + credit functions so consumers only import from './products'
export { getStorefrontProducts, getProductDetail, createProductOrder, getBuyerOrders } from './products-storefront';
export { getAvailableCredits, redeemSessionCredit } from './products-credits';

// ============================================================
// INSTRUCTOR-SIDE OPERATIONS
// ============================================================

/** Create a new product. Verifies the user is an instructor. */
export async function createProduct(
  supabase: SupabaseClient,
  instructorId: string,
  productData: Omit<ProductInsert, 'instructor_id'>
): Promise<DalResult<Product>> {
  try {
    const { data: user } = await supabase.from('users').select('is_instructor').eq('id', instructorId).single();

    if (!user?.is_instructor) {
      return { success: false, error: 'Only instructors can create products' };
    }

    const { data, error } = await supabase
      .from('products')
      .insert({ ...productData, instructor_id: instructorId })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'createProduct', instructorId });
    return { success: false, error: 'Failed to create product' };
  }
}

/** Update a product. Ownership enforced via .eq on instructor_id. */
export async function updateProduct(
  supabase: SupabaseClient,
  productId: string,
  instructorId: string,
  updates: ProductUpdate
): Promise<DalResult<Product>> {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', productId)
      .eq('instructor_id', instructorId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'updateProduct', productId, instructorId });
    return { success: false, error: 'Failed to update product' };
  }
}

/** Archive a product (soft-delete). */
export async function archiveProduct(
  supabase: SupabaseClient,
  productId: string,
  instructorId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('products')
      .update({ status: 'archived' })
      .eq('id', productId)
      .eq('instructor_id', instructorId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'archiveProduct', productId, instructorId });
    return { success: false, error: 'Failed to archive product' };
  }
}

/** Replace all variants for a product. Deletes existing, inserts new batch. */
export async function upsertVariants(
  supabase: SupabaseClient,
  productId: string,
  instructorId: string,
  variants: ProductVariantInsert[]
): Promise<DalResult<ProductVariant[]>> {
  try {
    // Verify ownership
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('instructor_id', instructorId)
      .single();

    if (!product) {
      return { success: false, error: 'Product not found or not owned by instructor' };
    }

    // Delete existing variants
    await supabase.from('product_variants').delete().eq('product_id', productId);

    if (variants.length === 0) {
      return { success: true, data: [] };
    }

    // Insert new variants
    const rows = variants.map((v, i) => ({
      product_id: productId,
      label: v.label,
      label_es: v.label_es ?? null,
      sku: v.sku ?? null,
      inventory_count: v.inventory_count ?? null,
      price_override_cents: v.price_override_cents ?? null,
      sort_order: v.sort_order ?? i,
    }));

    const { data, error } = await supabase.from('product_variants').insert(rows).select();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'upsertVariants', productId, instructorId });
    return { success: false, error: 'Failed to upsert variants' };
  }
}

/** List products owned by the instructor with optional filters. */
export async function getInstructorProducts(
  supabase: SupabaseClient,
  instructorId: string,
  filters?: ProductFilters
): Promise<DalResult<Product[]>> {
  try {
    let query = supabase
      .from('products')
      .select('*')
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.product_type) query = query.eq('product_type', filters.product_type);
    if (filters?.category) query = query.eq('category', filters.category);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'getInstructorProducts', instructorId });
    return { success: false, error: 'Failed to fetch instructor products' };
  }
}

/** List orders for an instructor's products, joined with product + buyer info. */
export async function getInstructorProductOrders(
  supabase: SupabaseClient,
  instructorId: string,
  filters?: OrderFilters
): Promise<DalResult<ProductOrderWithDetails[]>> {
  try {
    let query = supabase
      .from('product_orders')
      .select(
        '*, product:products!product_orders_product_id_fkey(id, title, title_es, thumbnail_url, product_type), buyer:users!product_orders_buyer_id_fkey(id, name, avatar_url)'
      )
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false });

    if (filters?.payment_status) query = query.eq('payment_status', filters.payment_status);
    if (filters?.fulfillment_status) query = query.eq('fulfillment_status', filters.fulfillment_status);
    if (filters?.product_id) query = query.eq('product_id', filters.product_id);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as ProductOrderWithDetails[] };
  } catch (error) {
    logError(error, { action: 'getInstructorProductOrders', instructorId });
    return { success: false, error: 'Failed to fetch product orders' };
  }
}

/** Mark an order as fulfilled. */
export async function fulfillOrder(
  supabase: SupabaseClient,
  orderId: string,
  instructorId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('product_orders')
      .update({
        fulfillment_status: 'completed',
        fulfilled_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('instructor_id', instructorId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'fulfillOrder', orderId, instructorId });
    return { success: false, error: 'Failed to fulfill order' };
  }
}
