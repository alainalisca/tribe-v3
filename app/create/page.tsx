/** Page: /create — Create a new training session with sport, location, date, and settings */
'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { haptic } from '@/lib/haptics';
import { celebrateSessionCreated } from '@/lib/confetti';
import { trackEvent } from '@/lib/analytics';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useVenuePicker } from '@/hooks/useVenuePicker';
import { ArrowLeft, Share2, Copy } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { insertSession, fetchUserProfile } from '@/lib/dal';
import PastSessionLink from '@/components/moments/PastSessionLink';
import { ACTIVE_CITY, locationMatchesNeighborhood } from '@/lib/city-config';
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
import TestSessionToggle from '@/components/session/TestSessionToggle';
import { shareSession, getSessionShareUrl, copyToClipboard } from '@/lib/share';
import { useTranslations } from '@/lib/i18n/useTranslations';
import {
  bogotaDateOf,
  firstErrorField,
  serverFieldError,
  validateSessionForm,
  type SessionFormField,
} from '@/lib/sessions/sessionFormRules';
import SportSelect from '@/components/session-form/SportSelect';
import { SkillLevelChips, WhoCanJoinChips, DurationChips } from '@/components/session-form/ChoiceChips';
import DateTimeFields from '@/components/session-form/DateTimeFields';
import LocationFields from '@/components/session-form/LocationFields';
import CapacityInput from '@/components/session-form/CapacityInput';
import { JoinPolicySelect, DescriptionField, EquipmentField } from '@/components/session-form/TextFields';
import PhotoHint from '@/components/session-form/PhotoHint';
import { useFieldErrorText } from '@/components/session-form/useFieldErrorText';

type SessionTemplateRow = Database['public']['Tables']['session_templates']['Row'];
type FormErrors = Partial<Record<SessionFormField | 'price_cents' | 'payment_instructions', string>>;

/**
 * A sport name from a query string, resolved to the exact canonical key.
 * Case-insensitive and punctuation-insensitive, so `crossfit`, `CrossFit`,
 * `jiu-jitsu` and `jiujitsu` all land on the real key. Returns null when
 * nothing matches, which leaves the field empty rather than prefilling a value
 * the picker cannot show.
 */
function canonicalSport(input: string | null): string | null {
  if (!input) return null;
  const fold = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = fold(input);
  return Object.keys(sportTranslations).find((k) => fold(k) === target) ?? null;
}

export default function CreateSessionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-theme-page" />}>
      <CreateSessionPageInner />
    </Suspense>
  );
}

function CreateSessionPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const tCreate = useTranslations('create');
  const tForm = useTranslations('sessionForm');
  const errorText = useFieldErrorText();
  const confirm = useConfirm();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [loading, setLoading] = useState(false);
  const venue = useVenuePicker();
  const [errors, setErrors] = useState<FormErrors>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    sport: '',
    date: '',
    start_time: '',
    duration: 60,
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    description: '',
    max_participants: 10 as number | '',
    join_policy: 'open',
    skill_level: 'all_levels',
    gender_preference: 'all',
    equipment: '',
    is_paid: false,
    price_display: '', // human-readable price (e.g. "15000") — converted to price_cents on submit
    currency: 'COP' as 'COP' | 'USD',
    payment_instructions: '',
    // T-JOIN1b: Sesión de prueba, off by default.
    is_test: false,
  });

  // Recurring session state (managed separately because RecurringSessionToggle uses its own shape)
  const [recurringValue, setRecurringValue] = useState({
    is_recurring: false,
    recurrence_pattern: '',
    recurrence_end_date: '',
  });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/auth');
        return;
      }
      setUser(user);
      // BUG-010: honor .success — treat a failed load as "unknown", not
      // implicitly non-instructor. Display-only here (toggles instructor UI),
      // no write, but we don't leave the discard-.success anti-pattern behind.
      const profileResult = await fetchUserProfile(supabase, user.id);
      if (profileResult.success && profileResult.data?.is_instructor) {
        setIsInstructor(true);
      }
    });

    // Pre-fill from URL query params (e.g. from Popular Routes)
    const qSport = searchParams.get('sport');
    const qTitle = searchParams.get('title');
    const qLocation = searchParams.get('location');
    const qLat = searchParams.get('lat');
    const qLng = searchParams.get('lng');

    if (qSport || qTitle || qLocation || qLat || qLng) {
      setFormData((prev) => ({
        ...prev,
        // Resolved against the canonical keys, NOT capitalised. This was
        // `qSport.charAt(0).toUpperCase() + qSport.slice(1)`, which turns
        // `crossfit` into `Crossfit` -- and the key is `CrossFit`, so the sport
        // silently failed to preselect for the one sport most likely to arrive
        // from a deep link. Capitalising is a guess at a casing convention;
        // matching the vocabulary is not.
        ...(canonicalSport(qSport) ? { sport: canonicalSport(qSport) as string } : {}),
        ...(qTitle || qLocation ? { location: qTitle || qLocation || '' } : {}),
        ...(qLat ? { latitude: parseFloat(qLat) } : {}),
        ...(qLng ? { longitude: parseFloat(qLng) } : {}),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  /** One field from a shared session-form component; clears that field's error. */
  function setField<K extends keyof typeof formData>(name: K, value: (typeof formData)[K]) {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function scrollToField(field: string) {
    const el = document.querySelector<HTMLElement>(`[name="${field}"], [data-field="${field}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    // The shared rules (lib/sessions/sessionFormRules), the same ones the edit
    // page runs: required fields, a start still ahead in Bogotá, 2 to 500
    // athletes, the recurrence days.
    const fieldErrors = validateSessionForm(formData, recurringValue, new Date());
    for (const [field, code] of Object.entries(fieldErrors)) {
      newErrors[field as SessionFormField] = errorText(code);
    }
    if (formData.is_paid) {
      const price = parseFloat(formData.price_display);
      if (!formData.price_display || isNaN(price) || price <= 0) {
        newErrors.price_cents =
          language === 'es' ? 'El precio es obligatorio para sesiones de pago' : 'Price is required for paid sessions';
      } else {
        // Minimum price enforcement.
        // - USD: $5.00 minimum (well above Stripe's $0.50 hard floor; also
        //   ensures the 15% platform fee rounds to something meaningful).
        // - COP: 20,000 COP minimum (~$5 USD at ~4,000 COP/USD).
        // Without this, an instructor could list a $0.01 session and bypass
        // the platform fee, AND Stripe would reject the Checkout Session.
        const MIN_USD = 5;
        const MIN_COP = 20000;
        if (formData.currency === 'USD' && price < MIN_USD) {
          newErrors.price_cents =
            language === 'es'
              ? `El precio mínimo es $${MIN_USD.toFixed(2)} USD`
              : `Minimum price is $${MIN_USD.toFixed(2)} USD`;
        } else if (formData.currency === 'COP' && price < MIN_COP) {
          newErrors.price_cents =
            language === 'es'
              ? `El precio mínimo es ${MIN_COP.toLocaleString('es-CO')} COP`
              : `Minimum price is ${MIN_COP.toLocaleString('en-US')} COP`;
        }
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
      scrollToField(firstErrorField(fieldErrors) ?? errorFields[0]);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    // Photo nudge: warn the instructor once if they're about to create a session with no photos.
    // A photo is how an athlete recognises the place, so this asks them to pause and reconsider.
    // Uses sessionStorage so we only nudge once per session creation attempt (re-submit bypasses).
    if (photos.length === 0 && !sessionStorage.getItem('tribe_photo_nudge_dismissed')) {
      // Al, 2026-10-21: say what a photo does for the athlete, no booking claim.
      const msg = tForm('noPhotoConfirm');
      const proceed = await confirm({
        title: language === 'es' ? 'Sin foto' : 'No photo',
        message: msg,
        confirmLabel: language === 'es' ? 'Continuar' : 'Continue',
        cancelLabel: language === 'es' ? 'Agregar foto' : 'Add a photo',
      });
      if (!proceed) {
        // Scroll the photo section into view to make the upload button obvious
        document.querySelector('[data-photo-section]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      sessionStorage.setItem('tribe_photo_nudge_dismissed', '1');
    }

    setLoading(true);
    try {
      // Build the session payload — strip UI-only fields and add paid fields
      const { price_display, is_paid, currency, payment_instructions, ...rest } = formData;

      // If the user typed a location but never picked a place from the
      // Google autocomplete (so coords are null), fall back to the matching
      // popular neighborhood's centre. This is a coarse approximation but
      // it puts the session inside the right city/neighborhood for the
      // home-feed bounding-box queries and the SessionCard map preview.
      // Costs zero API quota — pure text match against locationKeywords.
      if (rest.location && (rest.latitude == null || rest.longitude == null)) {
        for (const hood of ACTIVE_CITY.neighborhoods) {
          if (locationMatchesNeighborhood(rest.location, hood)) {
            rest.latitude = rest.latitude ?? hood.center.lat;
            rest.longitude = rest.longitude ?? hood.center.lng;
            break;
          }
        }
      }
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

      // Write to both coord pairs so the data is correct whether or not
      // migration 054's sync trigger has been applied yet. Once the
      // trigger is universally in place, dropping `latitude`/`longitude`
      // from the schema becomes safe.
      const result = await insertSession(supabase, {
        ...rest,
        ...paidFields,
        ...recurringFields,
        // validate() has already held this to a whole number from 2 to 500.
        max_participants: Number(rest.max_participants),
        creator_id: user!.id,
        current_participants: 0,
        status: 'active',
        photos: photos.length > 0 ? photos : null,
        location_lat: rest.latitude ?? null,
        location_lng: rest.longitude ?? null,
      });
      if (!result.success) throw new Error(result.error);

      // The session now exists. Attaching the venue is a separate outcome from
      // creating it, and commit() never throws, so a link failure cannot fall
      // into the catch below and report "session creation failed" about a
      // session that was created. The instructor is told what actually
      // happened and can set the venue from the edit screen.
      if (result.data?.id && venue.selected) {
        const link = await venue.commit(result.data.id, rest.sport);
        if (!link.ok) showError(tCreate('venueLinkFailed'));
      }

      trackEvent('session_created', {
        session_id: result.data?.id,
        is_paid: formData.is_paid,
        price_cents: formData.is_paid ? Math.round(parseFloat(formData.price_display) * 100) : 0,
        currency: formData.currency,
        sport: formData.sport,
        is_recurring: recurringValue.is_recurring,
        max_participants: Number(formData.max_participants),
      });
      showSuccess(t('sessionCreated'));
      celebrateSessionCreated();
      haptic('success');
      if (result.data?.id) {
        setCreatedSessionId(result.data.id);
      } else {
        router.push('/');
      }
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      logError(error, {
        action: 'handleSubmit',
        code: String(err?.code ?? ''),
        details: String(err?.details ?? ''),
        hint: String(err?.hint ?? ''),
      });
      const errorMsg = (err?.message ?? err?.code ?? err?.details ?? JSON.stringify(error)) as string;
      // Migration 227 refused it (a start that passed while the form was open,
      // or a capacity the browser check never saw): put it on the field.
      const refused = serverFieldError(errorMsg);
      if (refused) {
        const message = errorText(refused.error);
        setErrors((prev) => ({ ...prev, [refused.field]: message }));
        scrollToField(refused.field);
        showError(message ?? errorMsg);
        return;
      }
      showError(`${t('sessionCreationFailed')}: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className="min-h-screen bg-theme-page flex items-center justify-center"></div>;

  // --- Success state: share after creation ---
  if (createdSessionId) {
    const shareUrl = getSessionShareUrl(createdSessionId);
    return (
      <div className="min-h-screen bg-theme-page pb-nav">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
          <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="mr-3">
                <ArrowLeft className="w-6 h-6 text-theme-primary" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">{t('createSession')}</h1>
          </div>
        </div>

        <div className="pt-header max-w-2xl md:max-w-4xl mx-auto px-4 py-6">
          <div className="bg-theme-card rounded-2xl p-6 border border-theme text-center space-y-4">
            <div className="text-5xl mb-2">🎉</div>
            <h2 className="text-xl font-bold text-theme-primary">
              {language === 'es' ? '¡Sesión creada!' : 'Session Created!'}
            </h2>
            <p className="text-sm text-theme-secondary">
              {language === 'es'
                ? 'Comparte con tu comunidad para llenar cupos'
                : 'Share with your community to fill spots'}
            </p>

            <div className="space-y-3 pt-2">
              {/* WhatsApp share */}
              <button
                onClick={() => {
                  shareSession(
                    {
                      id: createdSessionId,
                      title: formData.sport,
                      sport: formData.sport,
                      date: formData.date,
                      time: formData.start_time,
                      neighborhood: formData.location,
                    },
                    language
                  );
                }}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white
                  hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all duration-200
                  flex items-center justify-center gap-2"
                style={{ backgroundColor: '#25D366' }}
              >
                <Share2 className="w-4 h-4" />
                {language === 'es' ? 'Compartir por WhatsApp' : 'Share via WhatsApp'}
              </button>

              {/* Copy link for Instagram */}
              <button
                onClick={async () => {
                  const copied = await copyToClipboard(shareUrl);
                  if (copied) {
                    showSuccess(language === 'es' ? 'Enlace copiado para Instagram!' : 'Link copied for Instagram!');
                  }
                }}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                  bg-theme-inset text-theme-secondary hover:opacity-90
                  flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {language === 'es' ? 'Copiar Enlace para Instagram' : 'Copy Link for Instagram'}
              </button>

              {/* Go to session */}
              <Link
                href={`/session/${createdSessionId}`}
                className="block w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                  bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95 text-center"
              >
                {language === 'es' ? 'Ver sesión' : 'View Session'}
              </Link>

              {/* Go home */}
              <Link
                href="/"
                className="block w-full py-2.5 text-sm font-medium text-theme-tertiary hover:text-theme-secondary transition-colors text-center"
              >
                {language === 'es' ? 'Ir al inicio' : 'Go Home'}
              </Link>
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Today in Bogotá, not on the device's clock, so the picker and the rules agree.
  const today = bogotaDateOf(new Date());

  return (
    <div className="min-h-screen bg-theme-page pb-nav">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{t('createSession')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto px-4 py-6">
        <TemplateSection
          supabase={supabase}
          userId={user.id}
          language={language}
          formData={{
            ...formData,
            max_participants: formData.max_participants === '' ? 10 : formData.max_participants,
          }}
          onLoadTemplate={handleLoadTemplate}
        />

        <div className="max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
          {/* noValidate: the shared rules decide, in the host's language, not the browser's bubble. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* T-MOM1: a session that already happened, for its photos (Moments on only). */}
            <PastSessionLink />
            <SportSelect value={formData.sport} onChange={(v) => setField('sport', v)} error={errors.sport} />

            <SkillLevelChips value={formData.skill_level} onChange={(v) => setField('skill_level', v)} />

            <WhoCanJoinChips value={formData.gender_preference} onChange={(v) => setField('gender_preference', v)} />

            <DateTimeFields
              date={formData.date}
              startTime={formData.start_time}
              onDateChange={(v) => setField('date', v)}
              onStartTimeChange={(v) => setField('start_time', v)}
              minDate={today}
              dateError={errors.date}
              startTimeError={errors.start_time}
            />

            <LocationFields
              venue={venue}
              disabled={loading}
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
              error={errors.location}
            />

            <DurationChips value={formData.duration} onChange={(v) => setField('duration', v)} />

            <CapacityInput
              value={formData.max_participants}
              onChange={(v) => setField('max_participants', v)}
              error={errors.max_participants}
            />

            <JoinPolicySelect value={formData.join_policy} onChange={(v) => setField('join_policy', v)} />

            <DescriptionField value={formData.description} onChange={(v) => setField('description', v)} />

            <EquipmentField value={formData.equipment} onChange={(v) => setField('equipment', v)} />

            {/* ─── Paid Session Toggle (instructors only) ─── */}
            {isInstructor && (
              <div className="border border-theme rounded-lg p-4 bg-theme-card space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-theme-primary font-semibold text-base">
                      {language === 'es' ? 'Sesión de pago' : 'Paid Session'}
                    </Label>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      {language === 'es' ? 'Cobra a los atletas por esta sesión' : 'Charge athletes for this session'}
                    </p>
                    {/* Tribe.OS hint — paid sessions on the main app
                        are one-offs; ongoing client management,
                        attendance, and revenue tracking live in
                        Tribe.OS. Always visible to instructors so
                        they can discover the upgrade path even
                        before they toggle the price on. */}
                    <Link
                      href="/os/dashboard"
                      className="inline-flex items-center gap-1 text-[11px] text-tribe-green hover:underline mt-1.5 font-medium"
                    >
                      {language === 'es'
                        ? 'Gestiona clientes, asistencia e ingresos en Tribe.OS →'
                        : 'Manage clients, attendance & revenue with Tribe.OS →'}
                    </Link>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.is_paid}
                    onClick={() => setFormData((prev) => ({ ...prev, is_paid: !prev.is_paid }))}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tribe-green ${formData.is_paid ? 'bg-tribe-green' : 'bg-stone-400'}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white dark:bg-tribe-green shadow-lg transform transition-transform ${formData.is_paid ? 'translate-x-5' : 'translate-x-0'}`}
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
                          min={formData.currency === 'COP' ? '20000' : '5'}
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
                              {/* Fee/payout lines intentionally hidden: Tribe takes no
                                  platform fee, so a "Platform fee (15%) / you earn 85%"
                                  split misstates the instructor's actual take (100%).
                                  Only the price the athlete pays is shown. Display-only
                                  change; no submission or validation math touched. */}
                              <div className="flex justify-between text-sm">
                                <span className="text-emerald-800 dark:text-emerald-300">
                                  {language === 'es' ? 'Precio del atleta' : 'Athlete pays'}
                                </span>
                                <span className="font-medium text-emerald-800 dark:text-emerald-300">
                                  {formatDisplayAmount(Number(formData.price_display), formData.currency as Currency)}
                                </span>
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
            )}

            {/* ─── Recurring Session Toggle ─── */}
            <div data-field="recurrence" className="border border-theme rounded-lg p-4 bg-theme-card">
              <RecurringSessionToggle
                value={recurringValue}
                onChange={(next) => {
                  setRecurringValue(next);
                  if (errors.recurrence) setErrors((prev) => ({ ...prev, recurrence: '' }));
                }}
              />
              {errors.recurrence && <p className="text-red-500 text-sm mt-1">{errors.recurrence}</p>}
            </div>

            {/* ─── Sesión de prueba (T-JOIN1b) ─── */}
            <TestSessionToggle
              value={formData.is_test}
              onChange={(next) => setFormData((prev) => ({ ...prev, is_test: next }))}
            />

            {/* Photos */}
            <div data-photo-section>
              <PhotoUploadSection
                supabase={supabase}
                userId={user.id}
                language={language}
                photos={photos}
                onPhotosChange={setPhotos}
              />
              {photos.length === 0 && <PhotoHint />}
            </div>

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
