-- 013_product_storefront.sql
-- Product Storefront: products, variants, orders

-- ============================================================
-- 1. PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  title_es        text,
  description     text,
  description_es  text,
  product_type    text NOT NULL CHECK (product_type IN ('physical', 'digital', 'package')),
  price_cents     integer NOT NULL CHECK (price_cents > 0),
  currency        text NOT NULL DEFAULT 'COP' CHECK (currency IN ('COP', 'USD')),
  compare_at_price_cents integer,
  images          text[] DEFAULT '{}',
  thumbnail_url   text,
  has_variants    boolean DEFAULT false,
  track_inventory boolean DEFAULT false,
  total_inventory integer,
  purchase_window_start timestamptz,
  purchase_window_end   timestamptz,
  digital_file_url  text,
  digital_file_name text,
  session_credits   integer,
  package_valid_days integer,
  fulfillment_method text CHECK (fulfillment_method IN ('pickup', 'digital', 'session_credit')),
  pickup_instructions    text,
  pickup_instructions_es text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived', 'sold_out')),
  featured        boolean DEFAULT false,
  category        text,
  tags            text[] DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. PRODUCT_VARIANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label               text NOT NULL,
  label_es            text,
  sku                 text,
  inventory_count     integer,
  price_override_cents integer,
  sort_order          integer DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. PRODUCT_ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS product_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              uuid NOT NULL REFERENCES users(id),
  instructor_id         uuid NOT NULL REFERENCES users(id),
  product_id            uuid NOT NULL REFERENCES products(id),
  variant_id            uuid REFERENCES product_variants(id),
  quantity              integer NOT NULL DEFAULT 1,
  unit_price_cents      integer NOT NULL,
  total_price_cents     integer NOT NULL,
  platform_fee_cents    integer NOT NULL,
  instructor_payout_cents integer NOT NULL,
  currency              text NOT NULL DEFAULT 'COP',
  promo_code_id         uuid,
  discount_cents        integer NOT NULL DEFAULT 0,
  payment_id            uuid REFERENCES payments(id),
  payment_status        text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'declined', 'refunded')),
  fulfillment_status    text NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'ready', 'completed', 'cancelled')),
  fulfilled_at          timestamptz,
  credits_remaining     integer,
  credits_expire_at     timestamptz,
  variant_label         text,
  buyer_note            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE INDEX idx_products_instructor_active ON products(instructor_id) WHERE status = 'active';
CREATE INDEX idx_products_type_status ON products(product_type, status);
CREATE INDEX idx_products_category_active ON products(category) WHERE status = 'active';
CREATE INDEX idx_product_orders_buyer ON product_orders(buyer_id);
CREATE INDEX idx_product_orders_instructor ON product_orders(instructor_id);
CREATE INDEX idx_product_orders_product ON product_orders(product_id);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

-- Products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_active_or_own" ON products
  FOR SELECT USING (
    status = 'active' OR instructor_id = auth.uid()
  );

CREATE POLICY "products_insert_own" ON products
  FOR INSERT WITH CHECK (instructor_id = auth.uid());

CREATE POLICY "products_update_own" ON products
  FOR UPDATE USING (instructor_id = auth.uid())
  WITH CHECK (instructor_id = auth.uid());

CREATE POLICY "products_delete_own" ON products
  FOR DELETE USING (instructor_id = auth.uid());

-- Product Variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variants_select_via_product" ON product_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND (products.status = 'active' OR products.instructor_id = auth.uid())
    )
  );

CREATE POLICY "variants_insert_own" ON product_variants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.instructor_id = auth.uid()
    )
  );

CREATE POLICY "variants_update_own" ON product_variants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.instructor_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.instructor_id = auth.uid()
    )
  );

CREATE POLICY "variants_delete_own" ON product_variants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_variants.product_id
        AND products.instructor_id = auth.uid()
    )
  );

-- Product Orders
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_buyer" ON product_orders
  FOR SELECT USING (buyer_id = auth.uid());

CREATE POLICY "orders_select_instructor" ON product_orders
  FOR SELECT USING (instructor_id = auth.uid());

CREATE POLICY "orders_insert_buyer" ON product_orders
  FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- ============================================================
-- 6. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('digital-products', 'digital-products', false)
ON CONFLICT (id) DO NOTHING;

-- product-images: public read, instructors upload own path
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "product_images_instructor_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "product_images_instructor_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- digital-products: owner download only, instructors upload own path
CREATE POLICY "digital_products_instructor_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'digital-products'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "digital_products_instructor_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'digital-products'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "digital_products_buyer_download" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'digital-products'
    AND EXISTS (
      SELECT 1 FROM product_orders
      WHERE product_orders.buyer_id = auth.uid()
        AND product_orders.payment_status = 'approved'
        AND product_orders.product_id IN (
          SELECT id FROM products
          WHERE products.instructor_id::text = (storage.foldername(name))[1]
        )
    )
  );

-- ============================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_product_orders_updated_at
  BEFORE UPDATE ON product_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
