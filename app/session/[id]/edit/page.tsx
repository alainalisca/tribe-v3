/** Page: /session/[id]/edit — Edit an existing session's details */
'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { formatPattern } from '@/lib/recurrence';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Repeat } from 'lucide-react';
import Link from 'next/link';
import { getEditSessionTranslations } from './translations';
import { useEditSession } from './useEditSession';
import PhotoUploadSection from '@/app/create/PhotoUploadSection';
import RecurringSessionToggle from '@/components/RecurringSessionToggle';
import TestSessionToggle from '@/components/session/TestSessionToggle';
import PriceSection from './PriceSection';
import SportSelect from '@/components/session-form/SportSelect';
import { SkillLevelChips, WhoCanJoinChips, DurationChips } from '@/components/session-form/ChoiceChips';
import DateTimeFields from '@/components/session-form/DateTimeFields';
import LocationFields from '@/components/session-form/LocationFields';
import CapacityInput from '@/components/session-form/CapacityInput';
import { JoinPolicySelect, DescriptionField, EquipmentField } from '@/components/session-form/TextFields';
import PhotoHint from '@/components/session-form/PhotoHint';
import { useFieldErrorText } from '@/components/session-form/useFieldErrorText';
import type { EditSessionFormData } from './useEditSession';

export default function EditSessionPage() {
  const { language } = useLanguage();
  const txt = getEditSessionTranslations(language);
  const errorText = useFieldErrorText();
  const {
    loading,
    saving,
    venue,
    formData,
    setFormData,
    recurringValue,
    setRecurringValue,
    photos,
    setPhotos,
    priceValue,
    setPriceValue,
    priceError,
    fieldErrors,
    clearFieldError,
    isInstructor,
    isSeriesChild,
    isSeriesParent,
    seriesPattern,
    handleSubmit,
    params,
    router,
    supabase,
    userId,
  } = useEditSession(language, txt);

  /** One field from a shared session-form component; clears that field's error. */
  function setField<K extends keyof EditSessionFormData>(name: K, value: EditSessionFormData[K]) {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name in fieldErrors) clearFieldError(name as keyof typeof fieldErrors);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-8">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href={`/session/${params.id}`}>
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{txt.editSession}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {/* noValidate: the shared rules decide, in the host's language. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Gate 6 (display-only): tell the host this session belongs to a
              series and what an edit here actually affects. Cadence is rendered
              from the PARENT's pattern (seriesPattern), never the child's date. */}
          {(isSeriesChild || isSeriesParent) && (
            <div className="flex items-start gap-2 rounded-lg border border-tribe-sky bg-tribe-sky/40 p-3 text-sm text-theme-primary">
              <Repeat className="w-4 h-4 mt-0.5 shrink-0 text-tribe-dark" />
              <p>
                {isSeriesParent
                  ? txt.seriesTemplateNotice
                  : txt.seriesOccurrenceNotice.replace('{cadence}', formatPattern(seriesPattern, language))}
              </p>
            </div>
          )}

          {/* T-POLISH1 PR 4: the same field components /create uses. */}
          <SportSelect
            value={formData.sport}
            onChange={(v) => setField('sport', v)}
            error={errorText(fieldErrors.sport)}
          />

          <SkillLevelChips value={formData.skill_level} onChange={(v) => setField('skill_level', v)} />

          <WhoCanJoinChips value={formData.gender_preference} onChange={(v) => setField('gender_preference', v)} />

          <LocationFields
            venue={venue}
            disabled={saving}
            value={formData.location}
            onChange={(location, coords) => {
              clearFieldError('location');
              setFormData((prev) => ({
                ...prev,
                location,
                latitude: coords?.lat ?? prev.latitude,
                longitude: coords?.lng ?? prev.longitude,
              }));
            }}
            error={errorText(fieldErrors.location)}
          />

          <DateTimeFields
            date={formData.date}
            startTime={formData.start_time}
            onDateChange={(v) => setField('date', v)}
            onStartTimeChange={(v) => setField('start_time', v)}
            dateError={errorText(fieldErrors.date)}
            startTimeError={errorText(fieldErrors.start_time)}
          />

          <DurationChips value={formData.duration} onChange={(v) => setField('duration', v)} />

          <CapacityInput
            value={formData.max_participants}
            onChange={(v) => setField('max_participants', v)}
            error={errorText(fieldErrors.max_participants)}
          />

          <JoinPolicySelect value={formData.join_policy} onChange={(v) => setField('join_policy', v)} />

          <DescriptionField value={formData.description} onChange={(v) => setField('description', v)} />

          <EquipmentField value={formData.equipment} onChange={(v) => setField('equipment', v)} />

          {/* ─── Paid Session (instructors only) ─── */}
          {isInstructor && <PriceSection value={priceValue} onChange={setPriceValue} error={priceError} txt={txt} />}

          {/* ─── Recurrence ─── */}
          {/* Hidden for a child occurrence: one session in a series is never
              independently recurring, so it must not expose the toggle
              (T-RECUR1 Gate 2). The parent template owns the schedule. */}
          {!isSeriesChild && (
            <div data-field="recurrence" className="border border-theme rounded-lg p-4 bg-theme-card">
              <Label className="mb-3 block text-theme-primary font-semibold">{txt.recurringSection}</Label>
              <RecurringSessionToggle
                value={recurringValue}
                onChange={(next) => {
                  setRecurringValue(next);
                  clearFieldError('recurrence');
                }}
              />
              {fieldErrors.recurrence && (
                <p className="text-red-500 text-sm mt-1">{errorText(fieldErrors.recurrence)}</p>
              )}
            </div>
          )}

          {/* ─── Sesión de prueba (T-JOIN1b) ─── */}
          <TestSessionToggle
            value={formData.is_test}
            onChange={(next) => setFormData((prev) => ({ ...prev, is_test: next }))}
          />

          {/* Cover photo — reuses the same upload component as the create flow */}
          {userId && (
            <div data-photo-section>
              <PhotoUploadSection
                supabase={supabase}
                userId={userId}
                language={language}
                photos={photos}
                onPhotosChange={setPhotos}
              />
              {photos.length === 0 && <PhotoHint />}
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={saving} className="flex-1 py-3 font-bold">
              {saving ? txt.saving : txt.save}
            </Button>
            <Button
              type="button"
              onClick={() => router.back()}
              variant="outline"
              className="px-6 py-3 border-theme text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid"
            >
              {txt.cancel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
