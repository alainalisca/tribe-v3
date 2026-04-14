'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import BottomNav from '@/components/BottomNav';
import ProductTypeSelector from '@/components/products/ProductTypeSelector';
import ProductImageUpload from '@/components/products/ProductImageUpload';
import VariantBuilder from '@/components/products/VariantBuilder';
import type { VariantInput } from '@/components/products/VariantBuilder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import type { User as AuthUser } from '@supabase/supabase-js';

type ProductType = 'physical' | 'digital' | 'package';

const CATEGORIES = [
  { value: 'apparel', en: 'Apparel', es: 'Ropa' },
  { value: 'equipment', en: 'Equipment', es: 'Equipo' },
  { value: 'supplements', en: 'Supplements', es: 'Suplementos' },
  { value: 'accessories', en: 'Accessories', es: 'Accesorios' },
  { value: 'training', en: 'Training', es: 'Entrenamiento' },
  { value: 'other', en: 'Other', es: 'Otro' },
];

export default function CreateProductPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  const [form, setForm] = useState({
    product_type: '' as ProductType | '',
    title: '',
    title_es: '',
    description: '',
    description_es: '',
    price_display: '',
    currency: 'COP' as 'COP' | 'USD',
    compare_at_price: '',
    category: '',
    tags: '',
    has_variants: false,
    track_inventory: false,
    total_inventory: '',
    pickup_instructions: '',
    session_credits: '5',
    valid_days: '90',
  });

  const [variants, setVariants] = useState<VariantInput[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (!u) {
        router.push('/auth');
        return;
      }
      setUser(u);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_type || !form.title || !form.price_display) {
      showError(language === 'es' ? 'Completa los campos obligatorios' : 'Fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const priceCents = Math.round(parseFloat(form.price_display) * 100);
      const compareAtCents = form.compare_at_price ? Math.round(parseFloat(form.compare_at_price) * 100) : null;

      const payload = {
        product_type: form.product_type,
        title: form.title,
        title_es: form.title_es || null,
        description: form.description || null,
        description_es: form.description_es || null,
        price_cents: priceCents,
        currency: form.currency,
        compare_at_price_cents: compareAtCents,
        category: form.category || null,
        tags: form.tags
          ? form.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        images,
        has_variants: form.has_variants,
        track_inventory: form.track_inventory,
        total_inventory: form.track_inventory ? parseInt(form.total_inventory) || 0 : null,
        pickup_instructions: form.product_type === 'physical' ? form.pickup_instructions || null : null,
        session_credits: form.product_type === 'package' ? parseInt(form.session_credits) || 5 : null,
        valid_days: form.product_type === 'package' ? parseInt(form.valid_days) || 90 : null,
        variants: form.has_variants
          ? variants.map((v) => ({
              name: v.name,
              name_es: v.name_es || null,
              price_cents: v.price_cents ? Math.round(parseFloat(v.price_cents) * 100) : null,
              inventory_count: v.inventory_count ? parseInt(v.inventory_count) : null,
            }))
          : [],
      };

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create product');

      trackEvent('product_created', {
        product_type: form.product_type,
        price_cents: priceCents,
        currency: form.currency,
      });
      showSuccess(language === 'es' ? 'Producto creado' : 'Product created');
      router.push(`/storefront/${user?.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showError(`${language === 'es' ? 'Error' : 'Failed'}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className="min-h-screen bg-theme-page" />;

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">
            {language === 'es' ? 'Crear Producto' : 'Create Product'}
          </h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product Type */}
          <ProductTypeSelector
            value={form.product_type}
            onChange={(type) => setForm((prev) => ({ ...prev, product_type: type }))}
            language={language as 'en' | 'es'}
          />

          {/* Title */}
          <div>
            <Label className="text-theme-primary mb-2">{language === 'es' ? 'T\u00EDtulo (EN)' : 'Title (EN)'} *</Label>
            <Input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder={language === 'es' ? 'Nombre del producto' : 'Product name'}
              className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
            />
          </div>
          <div>
            <Label className="text-theme-primary mb-2">{language === 'es' ? 'T\u00EDtulo (ES)' : 'Title (ES)'}</Label>
            <Input
              name="title_es"
              value={form.title_es}
              onChange={handleChange}
              placeholder={language === 'es' ? 'Nombre en espa\u00F1ol' : 'Spanish name'}
              className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-theme-primary mb-2">
              {language === 'es' ? 'Descripci\u00F3n (EN)' : 'Description (EN)'}
            </Label>
            <Textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              className="py-3 bg-theme-card text-theme-primary border-theme resize-none"
            />
          </div>
          <div>
            <Label className="text-theme-primary mb-2">
              {language === 'es' ? 'Descripci\u00F3n (ES)' : 'Description (ES)'}
            </Label>
            <Textarea
              name="description_es"
              value={form.description_es}
              onChange={handleChange}
              rows={3}
              className="py-3 bg-theme-card text-theme-primary border-theme resize-none"
            />
          </div>

          {/* Images */}
          <ProductImageUpload
            images={images}
            onImagesChange={setImages}
            userId={user.id}
            language={language as 'en' | 'es'}
          />

          {/* Price + Currency */}
          <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-3">
            <div>
              <Label className="text-theme-primary mb-2">{language === 'es' ? 'Moneda' : 'Currency'}</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['COP', 'USD'] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, currency: cur }))}
                    className={`p-3 rounded-lg font-medium transition-all text-center ${
                      form.currency === cur
                        ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                        : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'
                    }`}
                  >
                    {cur === 'COP' ? '\uD83C\uDDE8\uD83C\uDDF4 COP' : '\uD83C\uDDFA\uD83C\uDDF8 USD'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-theme-primary mb-2">
                {language === 'es' ? 'Precio' : 'Price'} ({form.currency}) *
              </Label>
              <Input
                type="number"
                name="price_display"
                value={form.price_display}
                onChange={handleChange}
                min="0"
                step={form.currency === 'COP' ? '1000' : '0.01'}
                placeholder={form.currency === 'COP' ? '45000' : '15.00'}
                className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
              />
            </div>
            <div>
              <Label className="text-theme-primary mb-2">
                {language === 'es' ? 'Precio anterior (opcional)' : 'Compare-at price (optional)'}
              </Label>
              <Input
                type="number"
                name="compare_at_price"
                value={form.compare_at_price}
                onChange={handleChange}
                min="0"
                step={form.currency === 'COP' ? '1000' : '0.01'}
                className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="text-theme-primary mb-2">{language === 'es' ? 'Categor\u00EDa' : 'Category'}</Label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            >
              <option value="">{language === 'es' ? 'Seleccionar' : 'Select'}</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {language === 'es' ? c.es : c.en}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <Label className="text-theme-primary mb-2">
              {language === 'es' ? 'Etiquetas (separadas por coma)' : 'Tags (comma-separated)'}
            </Label>
            <Input
              name="tags"
              value={form.tags}
              onChange={handleChange}
              placeholder="fitness, yoga, strength"
              className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
            />
          </div>

          {/* Conditional: Physical */}
          {form.product_type === 'physical' && (
            <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-3">
              <ToggleSwitch
                label={language === 'es' ? 'Variantes' : 'Variants'}
                checked={form.has_variants}
                onToggle={() => setForm((prev) => ({ ...prev, has_variants: !prev.has_variants }))}
              />
              {form.has_variants && (
                <VariantBuilder
                  variants={variants}
                  onChange={setVariants}
                  currency={form.currency}
                  language={language as 'en' | 'es'}
                />
              )}
              <ToggleSwitch
                label={language === 'es' ? 'Controlar inventario' : 'Track inventory'}
                checked={form.track_inventory}
                onToggle={() => setForm((prev) => ({ ...prev, track_inventory: !prev.track_inventory }))}
              />
              {form.track_inventory && (
                <Input
                  type="number"
                  name="total_inventory"
                  value={form.total_inventory}
                  onChange={handleChange}
                  placeholder={language === 'es' ? 'Cantidad disponible' : 'Available quantity'}
                  className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
                />
              )}
              <div>
                <Label className="text-theme-primary mb-2">
                  {language === 'es' ? 'Instrucciones de recogida' : 'Pickup instructions'}
                </Label>
                <Textarea
                  name="pickup_instructions"
                  value={form.pickup_instructions}
                  onChange={handleChange}
                  rows={2}
                  placeholder={language === 'es' ? 'D\u00F3nde y cu\u00E1ndo recoger' : 'Where and when to pick up'}
                  className="py-3 bg-theme-card text-theme-primary border-theme resize-none"
                />
              </div>
            </div>
          )}

          {/* Conditional: Package */}
          {form.product_type === 'package' && (
            <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-3">
              <div>
                <Label className="text-theme-primary mb-2">
                  {language === 'es' ? 'Cr\u00E9ditos de sesi\u00F3n' : 'Session credits'}
                </Label>
                <Input
                  type="number"
                  name="session_credits"
                  value={form.session_credits}
                  onChange={handleChange}
                  min="1"
                  className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
                />
              </div>
              <div>
                <Label className="text-theme-primary mb-2">
                  {language === 'es' ? 'D\u00EDas de validez' : 'Valid days'}
                </Label>
                <Input
                  type="number"
                  name="valid_days"
                  value={form.valid_days}
                  onChange={handleChange}
                  min="1"
                  className="h-auto py-3 bg-theme-card text-theme-primary border-theme"
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full py-3 font-bold">
            {loading
              ? language === 'es'
                ? 'Creando...'
                : 'Creating...'
              : language === 'es'
                ? 'Crear Producto'
                : 'Create Product'}
          </Button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
}

/** Simple toggle switch matching create/page.tsx pattern */
function ToggleSwitch({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-theme-primary font-semibold text-sm">{label}</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-tribe-green' : 'bg-stone-400'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
