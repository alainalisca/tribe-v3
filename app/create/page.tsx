/** Page: /create — Create a new training session with sport, location, date, and settings */
'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { celebrateSessionCreated } from '@/lib/confetti';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import LocationPicker from '@/components/LocationPicker';
import { ArrowLeft, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { insertSession } from '@/lib/dal';
import { formatDisplayAmount } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import TemplateSection from './TemplateSection';
import PhotoUploadSection from './PhotoUploadSection';
import RecurringSessionToggle from '@/components/RecurringSessionToggle';

type SessionTemplateRow = Database['public']['Tables']['session_templates']['Row'];
type FormErrors = Partial<
  Record<'sport' | 'date' | 'start_time' | 'location' | 'price_cents' | 'payment_instructions', string>
>;

type PromoCode = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  currency: string | null;
};

export default function CreateSessionPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [showBoostPrompt, setShowBoostPrompt] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [expandPromoSection, setExpandPromoSection] = useState(false);
  const [formData, setFormData] = useState({
    sport: '',
    date: '',
    start_time: '',
    duration: 60,
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    description: '',
    max_participants: 10,
    join_policy: 'open',
    skill_level: 'all_levels',
    gender_preference: 'all',
    equipment: '',
    is_paid: false,
    price_display: '', // human-readable price (e.g. "15000") — converted to price_cents on submit
    currency: 'COP' as 'COP' | 'USD',
    payment_instructions: '',
    attached_promo_id: null as string | null,
  });

  // Recurring session state (managed separately because RecurringSessionToggle uses its own shape)
  const [recurringValue, setRecurringValue] = useState({
    is_recurring: false,
    recurrence_pattern: '',
    recurrence_end_date: '',
  });

  const sports = Object.keys(sportTranslations).filter((s) => s !== 'All');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/auth');
      else setUser(user);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function handleLoadTemplate(template: SessionTemplateRow) {
    setFormData((prev) => ({
      ...prev,
      sport: template.sport,
      location: template.location,
      latitude: null,
      longitude: null,
      duration: template.duration,
      max_participants: template.max_participants,
      description: template.description || '',
    }));
  }

  function validate() {
    const newErrors: FormErrors = {};
    if (!formData.sport) newErrors.sport = t('sportRequired');
    if (!formData.date) newErrors.date = t('dateRequired');
    if (!formData.start_time) newErrors.start_time = t('startTimeRequired');
    if (!formData.location) newErrors.location = t('locationRequired');
    if (formData.is_paid) {
      const price = parseFloat(formData.price_display);
      if (!formData.price_display || isNaN(price) || price <= 0) {
        newErrors.price_cents =
          language === 'es' ? 'El precio es obligatorio para sesiones de pago' : 'Price is required for paid sessions';
      }
      if (!formData.payment_instructions.trim()) {
        newErrors.payment_instructions =
          language === 'es'
            ? 'Las instrucciones de pago son obligatorias'
            : 'Payment instructions are required for paid sessions';
      }
    }
    setErrors(newErrors);
    const errorFields = Object.keys(newErrors);
    if (errorFields.length > 0) {
      const firstField = errorFields[0];
      const el = document.querySelector<HTMLElement>(`[name="${firstField}"], [data-field="${firstField}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Build the session payload — strip UI-only fields and add paid fields
      const { price_display, is_paid, currency, payment_instructions, ...rest } = formData;
      const paidFields = is_paid
        ? {
            is_paid: true as const,
            price_cents: Math.round(parseFloat(price_display) * 100),
            currency,
            payment_instructions,
          }
        : { is_paid: false as const };

      // Build recurring fields if enabled
      const recurringFields = recurringValue.is_recurring
        ? {
            is_recurring: true,
            recurrence_pattern: recurringValue.recurrence_pattern || null,
            recurrence_end_date: recurringValue.recurrence_end_date
              ? new Date(recurringValue.recurrence_end_date + 'T00:00:00').toISOString()
              : null,
          }
        : { is_recurring: false };

      const result = await insertSession(supabase, {
        ...rest,
        ...paidFields,
        ...recurringFields,
        creator_id: user!.id,
        current_participants: 0,
        status: 'active',
        photos: photos.length > 0 ? photos : null,
      });
      if (!result.success) throw new Error(result.error);
      showSuccess(t('sessionCreated'));
      router.push('/');
      celebrateSessionCreated();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      logError(error, {
        action: 'handleSubmit',
        code: String(err?.code ?? ''),
        details: String(err?.details ?? ''),
        hint: String(err?.hint ?? ''),
      });
      const errorMsg = (err?.message ?? err?.code ?? err?.details ?? JSON.stringify(error)) as string;
      showError(`${t('sessionCreationFailed')}: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className="min-h-screen bg-theme-page flex items-center justify-center"></div>;

  const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{t('createSession')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto px-4 py-6">
        <TemplateSection
          supabase={supabase}
          userId={user.id}
          language={language}
          formData={formData}
          onLoadTemplate={handleLoadTemplate}
        />

        <div className="max-w-2xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Sport */}
            <div>
              <Label className="text-theme-primary mb-2">{t('sport')} *</Label>
              <select
                name="sport"
                value={formData.sport}
                onChange={handleChange}
                className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${errors.sport ? 'border-red-500' : 'border-theme'}`}
              >
                <option value="">{t('selectSport')}</option>
                {sports.map((sport) => (
                  <option key={sport} value={sport}>
                    {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
                  </option>
                ))}
              </select>
              {errors.sport && <p className="text-red-500 text-sm mt-1">{errors.sport}</p>}
            </div>

            {/* Skill Level */}
            <div>
              <Label className="text-theme-primary mb-2">{t('skillLevel')}</Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'all_levels', label: t('allLevels'), emoji: '🌟' },
                  { value: 'beginner', label: t('beginner'), emoji: '🌱' },
                  { value: 'intermediate', label: t('intermediate'), emoji: '💪' },
                  { value: 'advanced', label: t('advanced'), emoji: '🔥' },
                ].map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, skill_level: level.value })}
                    className={`p-3 rounded-lg font-medium transition-all flex flex-col items-center justify-center ${formData.skill_level === level.value ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    <div className="text-lg mb-1">{level.emoji}</div>
                    <div className="text-xs text-center leading-tight">{level.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Gender Preference */}
            <div>
              <Label className="text-theme-primary mb-2">{t('genderPreference')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'all', label: t('allWelcome'), emoji: '👥' },
                  { value: 'women_only', label: t('womenOnly'), emoji: '👩' },
                  { value: 'men_only', label: t('menOnly'), emoji: '👨' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, gender_preference: option.value })}
                    className={`p-3 rounded-lg font-medium transition-all text-center ${formData.gender_preference === option.value ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    <div className="text-lg mb-1">{option.emoji}</div>
                    <div className="text-xs">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-theme-primary mb-2">{t('date')} *</Label>
                <Input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  min={today}
                  className={`h-auto py-3 bg-theme-card text-theme-primary ${errors.date ? 'border-red-500' : 'border-theme'}`}
                />
                {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date}</p>}
              </div>
              <div>
                <Label className="text-theme-primary mb-2">{t('startTime')} *</Label>
                <Input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleChange}
                  className={`h-auto py-3 bg-theme-card text-theme-primary ${errors.start_time ? 'border-red-500' : 'border-theme'}`}
                />
                {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time}</p>}
              </div>
            </div>

            {/* Location */}
            <div data-field="location">
              <Label className="text-theme-primary mb-2">{t('location')} *</Label>
              <LocationPicker
                value={formData.location}
                onChange={(location, coords) => {
                  setErrors((prev) => ({ ...prev, location: '' }));
                  setFormData((prev) => ({
                    ...prev,
                    location,
                    latitude: coords?.lat ?? null,
                    longitude: coords?.lng ?? null,
                  }));
                }}
                placeholder={t('locationPlaceholder')}
                error={errors.location}
              />
            </div>

            {/* Duration */}
            <div>
              <Label className="text-theme-primary mb-2">
                {t('duration')} ({t('minutes')})
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60, 90, 120, 150, 180].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration: mins })}
                    className={`p-3 rounded-lg font-medium transition-all ${formData.duration === mins ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Participants */}
            <div>
              <Label className="text-theme-primary mb-2">{t('maxParticipants')}</Label>
              <Input
                type="number"
                name="max_participants"
                value={formData.max_participants}
                onChange={handleChange}
                min="2"
                max="100000"
                className="h-auto py-3 border-theme bg-theme-card text-theme-primary"
              />
            </div>

            {/* Join Policy */}
            <div>
              <Label className="text-theme-primary mb-2">{t('joinPolicy')}</Label>
              <select
                name="join_policy"
                value={formData.join_policy}
                onChange={handleChange}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              >
                <option value="open">{t('openJoinPolicy')}</option>
                <option value="curated">{t('curatedJoinPolicy')}</option>
                <option value="invite_only">{t('inviteOnlyJoinPolicy')}</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <Label className="text-theme-primary mb-2">{t('description')}</Label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder={t('describeSession')}
                className="py-3 border-theme bg-theme-card text-theme-primary resize-none"
              />
            </div>

            {/* Equipment */}
            <div>
              <Label className="text-theme-primary mb-2">🎒 {t('equipment')}</Label>
              <Input
                type="text"
                name="equipment"
                value={formData.equipment}
                onChange={handleChange}
                placeholder={t('equipmentPlaceholder')}
                className="h-auto py-3 border-theme bg-theme-card text-theme-primary"
              />
            </div>

            {/* ─── Paid Session Toggle ─── */}
            <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-theme-primary font-semibold text-base">
                    {language === 'es' ? 'Sesión de pago' : 'Paid Session'}
                  </Label>
                  <p className="text-xs text-theme-secondary mt-0.5">
                    {language === 'es' ? 'Cobra a los atletas por esta sesión' : 'Charge athletes for this session'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.is_paid}
                  onClick={() => setFormData((prev) => ({ ...prev, is_paid: !prev.is_paid }))}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tribe-green ${formData.is_paid ? 'bg-tribe-green' : 'bg-gray-400'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform ${formData.is_paid ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {formData.is_paid && (
                <div className="space-y-3 pt-2 border-t border-theme">
                  {/* Currency selector */}
                  <div>
                    <Label className="text-theme-primary mb-2">{language === 'es' ? 'Moneda' : 'Currency'}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['COP', 'USD'] as const).map((cur) => (
                        <button
                          key={cur}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, currency: cur }))}
                          className={`p-3 rounded-lg font-medium transition-all text-center ${formData.currency === cur ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                        >
                          {cur === 'COP' ? '🇨🇴 COP' : '🇺🇸 USD'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price input */}
                  <div>
                    <Label className="text-theme-primary mb-2">
                      {language === 'es' ? 'Precio' : 'Price'} ({formData.currency}) *
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-secondary font-medium">
                        {formData.currency === 'COP' ? '$' : '$'}
                      </span>
                      <Input
                        type="number"
                        name="price_display"
                        value={formData.price_display}
                        onChange={handleChange}
                        min="0"
                        step={formData.currency === 'COP' ? '1000' : '0.01'}
                        placeholder={formData.currency === 'COP' ? '45000' : '15.00'}
                        className={`h-auto py-3 pl-8 bg-theme-card text-theme-primary ${errors.price_cents ? 'border-red-500' : 'border-theme'}`}
                      />
                    </div>
                    {errors.price_cents && <p className="text-red-500 text-sm mt-1">{errors.price_cents}</p>}
                    {formData.price_display &&
                      !isNaN(parseFloat(formData.price_display)) &&
                      parseFloat(formData.price_display) > 0 && (
                        <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                            {language === 'es' ? 'Desglose de pago' : 'Payment Breakdown'}
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-emerald-800 dark:text-emerald-300">
                                {language === 'es' ? 'Precio del atleta' : 'Athlete pays'}
                              </span>
                              <span className="font-medium text-emerald-800 dark:text-emerald-300">
                                {formatDisplayAmount(Number(formData.price_display), formData.currency as Currency)}{' '}
                                {formData.currency}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-stone-500 dark:text-gray-400">
                                {language === 'es' ? 'Tarifa de plataforma (15%)' : 'Platform fee (15%)'}
                              </span>
                              <span className="text-stone-500 dark:text-gray-400">
                                -
                                {formatDisplayAmount(
                                  Math.round(Number(formData.price_display) * 0.15),
                                  formData.currency as Currency
                                )}{' '}
                                {formData.currency}
                              </span>
                            </div>
                            <div className="border-t border-emerald-200 dark:border-emerald-700 pt-1">
                              <div className="flex justify-between text-sm font-bold">
                                <span className="text-emerald-800 dark:text-emerald-300">
                                  {language === 'es' ? 'Tú recibes (85%)' : 'You earn (85%)'}
                                </span>
                                <span className="text-emerald-800 dark:text-emerald-300">
                                  {formatDisplayAmount(
                                    Math.round(Number(formData.price_display) * 0.85),
                                    formData.currency as Currency
                                  )}{' '}
                                  {formData.currency}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Payment instructions */}
                  <div>
                    <Label className="text-theme-primary mb-2">
                      {language === 'es' ? 'Instrucciones de pago' : 'Payment Instructions'} *
                    </Label>
                    <Textarea
                      name="payment_instructions"
                      value={formData.payment_instructions}
                      onChange={handleChange}
                      rows={3}
                      placeholder={
                        language === 'es'
                          ? 'Ej: Nequi: 300-123-4567 o efectivo en el lugar'
                          : 'E.g. Nequi: 300-123-4567, Venmo: @coach-maria, or cash at venue'
                      }
                      className={`py-3 bg-theme-card text-theme-primary resize-none ${errors.payment_instructions ? 'border-red-500' : 'border-theme'}`}
                    />
                    {errors.payment_instructions && (
                      <p className="text-red-500 text-sm mt-1">{errors.payment_instructions}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Recurring Session Toggle ─── */}
            <div className="border border-theme rounded-lg p-4 bg-theme-card">
              <RecurringSessionToggle value={recurringValue} onChange={setRecurringValue} />
            </div>

            {/* Photos */}
            <PhotoUploadSection
              supabase={supabase}
              userId={user.id}
              language={language}
              photos={photos}
              onPhotosChange={setPhotos}
            />

            <Button type="submit" disabled={loading} className="w-full py-3 font-bold">
              {loading ? t('creating') : t('createSession')}
            </Button>
          </form>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
