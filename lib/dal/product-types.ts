// TypeScript types for the Product Storefront feature
// These mirror the tables in 013_product_storefront.sql

export interface Product {
  id: string;
  instructor_id: string;
  title: string;
  title_es: string | null;
  description: string | null;
  description_es: string | null;
  product_type: 'physical' | 'digital' | 'package';
  price_cents: number;
  currency: 'COP' | 'USD';
  compare_at_price_cents: number | null;
  images: string[];
  thumbnail_url: string | null;
  has_variants: boolean;
  track_inventory: boolean;
  total_inventory: number | null;
  purchase_window_start: string | null;
  purchase_window_end: string | null;
  digital_file_url: string | null;
  digital_file_name: string | null;
  session_credits: number | null;
  package_valid_days: number | null;
  fulfillment_method: 'pickup' | 'digital' | 'session_credit' | null;
  pickup_instructions: string | null;
  pickup_instructions_es: string | null;
  status: 'active' | 'draft' | 'archived' | 'sold_out';
  featured: boolean;
  category: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ProductInsert {
  instructor_id: string;
  title: string;
  title_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  product_type: 'physical' | 'digital' | 'package';
  price_cents: number;
  currency?: 'COP' | 'USD';
  compare_at_price_cents?: number | null;
  images?: string[];
  thumbnail_url?: string | null;
  has_variants?: boolean;
  track_inventory?: boolean;
  total_inventory?: number | null;
  purchase_window_start?: string | null;
  purchase_window_end?: string | null;
  digital_file_url?: string | null;
  digital_file_name?: string | null;
  session_credits?: number | null;
  package_valid_days?: number | null;
  fulfillment_method?: 'pickup' | 'digital' | 'session_credit' | null;
  pickup_instructions?: string | null;
  pickup_instructions_es?: string | null;
  status?: 'active' | 'draft' | 'archived' | 'sold_out';
  featured?: boolean;
  category?: string | null;
  tags?: string[];
}

export interface ProductUpdate {
  title?: string;
  title_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  product_type?: 'physical' | 'digital' | 'package';
  price_cents?: number;
  currency?: 'COP' | 'USD';
  compare_at_price_cents?: number | null;
  images?: string[];
  thumbnail_url?: string | null;
  has_variants?: boolean;
  track_inventory?: boolean;
  total_inventory?: number | null;
  purchase_window_start?: string | null;
  purchase_window_end?: string | null;
  digital_file_url?: string | null;
  digital_file_name?: string | null;
  session_credits?: number | null;
  package_valid_days?: number | null;
  fulfillment_method?: 'pickup' | 'digital' | 'session_credit' | null;
  pickup_instructions?: string | null;
  pickup_instructions_es?: string | null;
  status?: 'active' | 'draft' | 'archived' | 'sold_out';
  featured?: boolean;
  category?: string | null;
  tags?: string[];
}

export interface ProductVariant {
  id: string;
  product_id: string;
  label: string;
  label_es: string | null;
  sku: string | null;
  inventory_count: number | null;
  price_override_cents: number | null;
  sort_order: number;
  created_at: string;
}

export interface ProductVariantInsert {
  label: string;
  label_es?: string | null;
  sku?: string | null;
  inventory_count?: number | null;
  price_override_cents?: number | null;
  sort_order?: number;
}

export interface ProductOrder {
  id: string;
  buyer_id: string;
  instructor_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  platform_fee_cents: number;
  instructor_payout_cents: number;
  currency: string;
  promo_code_id: string | null;
  discount_cents: number;
  payment_id: string | null;
  payment_status: 'pending' | 'approved' | 'declined' | 'refunded';
  fulfillment_status: 'pending' | 'ready' | 'completed' | 'cancelled';
  fulfilled_at: string | null;
  credits_remaining: number | null;
  credits_expire_at: string | null;
  variant_label: string | null;
  buyer_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductOrderInsert {
  buyer_id: string;
  instructor_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity?: number;
  unit_price_cents: number;
  total_price_cents: number;
  platform_fee_cents: number;
  instructor_payout_cents: number;
  currency?: string;
  promo_code_id?: string | null;
  discount_cents?: number;
  payment_id?: string | null;
  payment_status?: 'pending' | 'approved' | 'declined' | 'refunded';
  fulfillment_status?: 'pending' | 'ready' | 'completed' | 'cancelled';
  credits_remaining?: number | null;
  credits_expire_at?: string | null;
  variant_label?: string | null;
  buyer_note?: string | null;
}

/** Product with nested variants (used by detail views) */
export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

/** Order with joined product info (used by buyer/instructor order lists) */
export interface ProductOrderWithProduct extends ProductOrder {
  product: Pick<Product, 'id' | 'title' | 'title_es' | 'thumbnail_url' | 'product_type'>;
}

/** Order with product + buyer info (used by instructor dashboard) */
export interface ProductOrderWithDetails extends ProductOrder {
  product: Pick<Product, 'id' | 'title' | 'title_es' | 'thumbnail_url' | 'product_type'>;
  buyer: { id: string; name: string; avatar_url: string | null };
}

/** Filters for instructor product list */
export interface ProductFilters {
  status?: Product['status'];
  product_type?: Product['product_type'];
  category?: string;
}

/** Filters for order list */
export interface OrderFilters {
  payment_status?: ProductOrder['payment_status'];
  fulfillment_status?: ProductOrder['fulfillment_status'];
  product_id?: string;
}

/** Data needed to create a product order from the client */
export interface CreateOrderData {
  buyer_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  promo_code_id?: string | null;
  discount_cents?: number;
  payment_id?: string | null;
  buyer_note?: string | null;
  /** SEC-07: caller-supplied idempotency key — a retry with the same key
   *  returns the original order instead of double-charging. */
  idempotency_key?: string;
}
