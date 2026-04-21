/**
 * /product/[id] — Server Component.
 *
 * Third Tribe route on the Server Component pattern. Fetches the
 * product (with variants via the `product_variants(*)` join) and the
 * instructor profile in one server-side round trip, then hands off to
 * the client for interactivity (variant selection, quantity, buy).
 *
 * Uses Next.js `notFound()` for the missing-product case so the route
 * renders the app's 404 boundary instead of a custom "Product not found"
 * screen. Faster UX and gives the middleware/CDN a proper 404 status to
 * work with.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import ProductDetailClient, { type Product, type Instructor } from './ProductDetailClient';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { id: productId } = await params;

  const supabase = await createClient();

  // Product + variants (nested via PostgREST join).
  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('id', productId)
    .single();

  if (productError || !productData) {
    if (productError) {
      logError(productError, { action: 'ProductDetailPage.productFetch', productId });
    }
    notFound();
  }

  const product = productData as Product;

  // Instructor is optional — only fetch if the product has an instructor_id.
  // Second round trip rather than a join because product.instructor_id isn't
  // a foreign key in all deployments (storefront rollout flag).
  let instructor: Instructor | null = null;
  if (product.instructor_id) {
    const { data: instData, error: instError } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .eq('id', product.instructor_id)
      .single();

    if (instError) {
      // Non-fatal: we can still render the product without the instructor card.
      logError(instError, {
        action: 'ProductDetailPage.instructorFetch',
        instructorId: product.instructor_id,
      });
    } else if (instData) {
      instructor = instData as Instructor;
    }
  }

  return <ProductDetailClient product={product} instructor={instructor} />;
}
