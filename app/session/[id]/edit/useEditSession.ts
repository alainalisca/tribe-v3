'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import {
  fetchSession,
  fetchSessionFields,
  fetchSessionPaymentInstructions,
  fetchConfirmedCount,
  fetchUserProfile,
  updateSessionAsHost,
} from '@/lib/dal';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  isEditLocked,
  isSeriesChild,
  needsPriceChangeConfirmation,
  buildPriceFields,
  validatePriceInput,
  type PriceFormInput,
  type PriceSnapshot,
  type PriceValidationError,
} from './editGuards';
import type { EditSessionTranslations } from './translations';

export interface EditSessionFormData {
  sport: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  date: string;
  start_time: string;
  duration: number;
  max_participants: number;
  description: string;
  skill_level: string;
  gender_preference: string;
  equipment: string;
  join_policy: string;
}

/** Shape expected by RecurringSessionToggle — kept separate from formData so
 *  the toggle component can own its pattern string rather than forcing a flat
 *  field into the main form.  Mirrors the shape used on the create page. */
export interface EditRecurringValue {
  is_recurring: boolean;
  recurrence_pattern: string;
  recurrence_end_date: string;
}

const defaultFormData: EditSessionFormData = {
  sport: '',
  location: '',
  latitude: null,
  longitude: null,
  date: '',
  start_time: '',
  duration: 60,
  max_participants: 10,
  description: '',
  skill_level: 'all_levels',
  gender_preference: 'all',
  equipment: '',
  join_policy: 'open',
};

const defaultRecurring: EditRecurringValue = {
  is_recurring: false,
  recurrence_pattern: '',
  recurrence_end_date: '',
};

const defaultPrice: PriceFormInput = {
  is_paid: false,
  price_display: '',
  currency: 'COP',
  payment_instructions: '',
};

// photos is managed separately (not in formData) because PhotoUploadSection
// owns its own state shape: string[] rather than a form field value.
export type EditSessionPhotos = string[];

export function useEditSession(language: 'en' | 'es', txt: EditSessionTranslations) {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<EditSessionFormData>(defaultFormData);
  const [recurringValue, setRecurringValue] = useState<EditRecurringValue>(defaultRecurring);
  const [photos, setPhotos] = useState<EditSessionPhotos>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  // True when editing one occurrence of a series (recurring_parent_id set). A
  // child is never independently recurring, so the recurrence toggle is hidden
  // and the submit path forces the non-recurring shape (T-RECUR1 Gate 2).
  const [seriesChild, setSeriesChild] = useState(false);
  // Gate 6 (display-only): whether this row is a series template (a true parent),
  // and the recurrence_pattern to render the cadence from. For a child the
  // pattern comes from the PARENT (fetched below), never inferred from the
  // child's own date — H1 found live children whose weekday contradicts the
  // parent's pattern, so a date-derived cadence would be wrong.
  const [seriesParent, setSeriesParent] = useState(false);
  const [seriesPattern, setSeriesPattern] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState<PriceFormInput>(defaultPrice);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [originalPrice, setOriginalPrice] = useState<PriceSnapshot>({ is_paid: false, price_cents: null });
  // null = count fetch failed; the price-change dialog then fails safe (shows).
  const [confirmedCount, setConfirmedCount] = useState<number | null>(0);

  useEffect(() => {
    // RLS-H4: resolve auth BEFORE any fetch. Edit is host-only — a logged-out
    // visitor can't save (RLS blocks it) and shouldn't read the base table for a
    // form they can't use. Bounce anon to /auth instead of firing an anon
    // base-table fetchSession, keeping "zero anon base-table reads on sessions"
    // true ahead of the Gate 3 revoke. (Previously getUser + loadSession raced,
    // so the base-table read fired for anon before auth resolved.)
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/auth?returnTo=/session/${params.id as string}/edit`);
        return;
      }
      setUserId(user.id);
      loadSession(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadSession(uid: string) {
    try {
      const result = await fetchSession(supabase, params.id as string);
      if (!result.success || !result.data) throw new Error(result.error);

      const session = result.data;

      // Owner guard: only the host may open the edit form. RLS would reject
      // the save anyway, but bouncing here beats a generic error at submit.
      if (session.creator_id !== uid) {
        showError(txt.notOwner);
        router.replace(`/session/${params.id}`);
        return;
      }

      // Past sessions are read only; recurring parents stay editable because
      // they define what future occurrences inherit.
      if (isEditLocked(session, new Date())) {
        showError(txt.pastLocked);
        router.replace(`/session/${params.id}`);
        return;
      }

      setFormData({
        sport: session.sport,
        location: session.location,
        latitude: session.latitude || null,
        longitude: session.longitude || null,
        date: session.date,
        start_time: session.start_time,
        duration: session.duration,
        max_participants: session.max_participants,
        description: session.description || '',
        skill_level: session.skill_level || 'all_levels',
        gender_preference: session.gender_preference || 'all',
        equipment: session.equipment || '',
        join_policy: session.join_policy || 'open',
      });

      // Initialise recurrence state from the existing session values.
      // recurrence_end_date is stored as ISO timestamp; strip time part so
      // the date input renders correctly.
      const endDateRaw = session.recurrence_end_date ?? '';
      const endDateForInput = endDateRaw ? endDateRaw.slice(0, 10) : '';
      setRecurringValue({
        is_recurring: session.is_recurring ?? false,
        recurrence_pattern: session.recurrence_pattern ?? '',
        recurrence_end_date: endDateForInput,
      });

      // A child occurrence (points at a parent) can never be independently
      // recurring; remember it so the toggle is hidden and submit coerces.
      const child = isSeriesChild(session);
      setSeriesChild(child);

      // Gate 6: resolve the series role + cadence source for the read-only
      // notice. A true parent uses its OWN pattern; a child fetches the
      // PARENT's pattern (one extra query, child-only — never inferred from
      // the child's date). A plain one-off gets neither.
      const parent = session.is_recurring === true && session.recurring_parent_id == null;
      setSeriesParent(parent);
      if (parent) {
        setSeriesPattern(session.recurrence_pattern ?? null);
      } else if (child && session.recurring_parent_id) {
        const parentResult = await fetchSessionFields(supabase, session.recurring_parent_id, 'recurrence_pattern');
        setSeriesPattern(
          parentResult.success
            ? ((parentResult.data as { recurrence_pattern: string | null }).recurrence_pattern ?? null)
            : null
        );
      }

      // Initialise photo state from the existing session photos (may be null)
      setPhotos(session.photos ?? []);

      // Price state. payment_instructions is not on fetchSession's public
      // column list; it is host-only and fetched separately.
      setOriginalPrice({ is_paid: session.is_paid ?? false, price_cents: session.price_cents ?? null });
      const instructionsResult = await fetchSessionPaymentInstructions(supabase, params.id as string, uid);
      setPriceValue({
        is_paid: session.is_paid ?? false,
        price_display: session.price_cents ? String(session.price_cents / 100) : '',
        currency: session.currency === 'USD' ? 'USD' : 'COP',
        payment_instructions: instructionsResult.success ? (instructionsResult.data ?? '') : '',
      });

      const countResult = await fetchConfirmedCount(supabase, params.id as string);
      setConfirmedCount(countResult.success ? (countResult.data ?? 0) : null);

      const profileResult = await fetchUserProfile(supabase, uid);
      setIsInstructor(profileResult.success && !!profileResult.data?.is_instructor);
    } catch {
      showError(language === 'es' ? 'Error al cargar sesión' : 'Error loading session');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  const priceErrorText: Record<PriceValidationError, string> = {
    price_required: txt.priceRequired,
    min_usd: txt.minUsd,
    min_cop: txt.minCop,
    instructions_required: txt.instructionsRequired,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isInstructor) {
      const validationError = validatePriceInput(priceValue);
      if (validationError) {
        const message = priceErrorText[validationError];
        setPriceError(message);
        showError(message);
        return;
      }
      setPriceError(null);

      // Spec 7.5: never silently flip a joined free session to paid.
      if (needsPriceChangeConfirmation(originalPrice, priceValue.is_paid, confirmedCount ?? 1)) {
        const proceed = await confirm({
          title: txt.confirmPriceTitle,
          message: txt.confirmPriceMessage,
          confirmLabel: txt.confirmPriceYes,
          cancelLabel: txt.confirmPriceNo,
        });
        if (!proceed) return;
      }
    }

    setSaving(true);
    try {
      // Build recurrence fields mirroring the create-page convention.
      // When turning off, null out the pattern and end_date so the DB row
      // doesn't retain stale values from the previous schedule.
      // A child occurrence is never independently recurring: force the
      // non-recurring shape regardless of what the (hidden) toggle held, so a
      // child can never be written into the is_recurring=true + parent-set
      // nonsense state (T-RECUR1 Gate 2).
      const recurringFields =
        !seriesChild && recurringValue.is_recurring
          ? {
              is_recurring: true,
              recurrence_pattern: recurringValue.recurrence_pattern || null,
              recurrence_end_date: recurringValue.recurrence_end_date
                ? new Date(recurringValue.recurrence_end_date + 'T00:00:00').toISOString()
                : null,
            }
          : {
              is_recurring: false,
              recurrence_pattern: null,
              recurrence_end_date: null,
            };

      // Non-instructors never touch the price columns: their sessions are
      // free and omitting the fields leaves the row's price state untouched.
      const priceFields = isInstructor ? buildPriceFields(priceValue) : {};

      // Persist photos alongside the other edited fields. Passing null when
      // the array is empty clears any previously stored photos (matches the
      // create-flow convention in insertSession).
      const result = await updateSessionAsHost(supabase, params.id as string, {
        ...formData,
        ...recurringFields,
        ...priceFields,
        photos: photos.length > 0 ? photos : null,
      });
      if (!result.success) throw new Error(result.error);

      // Cross-page invalidation: the home feed caches its session list and
      // refetches when this flag is set (same convention as join/leave/cancel).
      sessionStorage.setItem('tribe_sessions_dirty', '1');

      showSuccess(txt.updated);
      router.push(`/session/${params.id}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_session', language));
    } finally {
      setSaving(false);
    }
  }

  return {
    loading,
    saving,
    formData,
    setFormData,
    recurringValue,
    setRecurringValue,
    photos,
    setPhotos,
    priceValue,
    setPriceValue,
    priceError,
    isInstructor,
    isSeriesChild: seriesChild,
    isSeriesParent: seriesParent,
    seriesPattern,
    handleSubmit,
    params,
    router,
    supabase,
    userId,
  };
}
