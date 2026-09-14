'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { applyForPartnership, fetchPartnerByUserId, selfActivatePartner } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import { createNotification, fetchAdminUserIds, enableInstructorAccount } from '@/lib/dal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { PartnerApplyErrors } from '@/components/partner/PartnerApplyForm';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import PartnerApplyForm from '@/components/partner/PartnerApplyForm';
import { ArrowLeft, Loader, CheckCircle, Star, Zap, AlertTriangle } from 'lucide-react';

export default function PartnerApplyPage() {
  const router = useRouter();
  const supabase = createClient();

  const t = useTranslations('gymSignup');

  const [userId, setUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  // A FAILED lookup is not the same as a negative answer. Before T-GYM4 both
  // the profile read and the partner read collapsed into "not an instructor" /
  // "no application", so a transient error told the user they lacked an account
  // they have, and -- worse -- rendered the form to someone who already had a
  // row, whose submit then died on the unique constraint.
  const [loadFailed, setLoadFailed] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingPartner, setExistingPartner] = useState<FeaturedPartner | null>(null);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('studio');
  const [description, setDescription] = useState('');
  const [descriptionEs, setDescriptionEs] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<PartnerApplyErrors>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUserId(user.id);

    // Audit E-3: surface the error instead of silently treating the user
    // as non-instructor.
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('is_instructor')
      .eq('id', user.id)
      .single();

    if (profileError) {
      logError(profileError, { action: 'partners_apply_instructor_check', userId: user.id });
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setIsInstructor(!!profile?.is_instructor);

    // result.success was never checked here. A failed read left existingPartner
    // null, which renders the form -- and the only thing that then told the user
    // they already had an application was a raw unique-violation message.
    const result = await fetchPartnerByUserId(supabase, user.id);
    if (!result.success) {
      logError(new Error(result.error ?? 'fetchPartnerByUserId failed'), {
        action: 'partners_apply_existing_check',
        userId: user.id,
      });
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setExistingPartner(result.data ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Recovery for the "gym account not enabled" state: same write as the
   *  /onboarding/role cards, then reload so the form renders in place. */
  async function handleEnableGymAccount() {
    if (!userId || enabling) return;
    setEnabling(true);
    const result = await enableInstructorAccount(supabase, userId);
    setEnabling(false);

    if (!result.success) {
      logError(new Error(result.error ?? 'enableInstructorAccount failed'), {
        action: 'partners_apply_enable_gym_account',
        userId,
      });
      showError(t('roleSaveFailed'));
      return;
    }
    await load();
  }

  function toggleSpecialty(s: string) {
    setSelectedSpecialties((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function clearError(field: keyof PartnerApplyErrors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  /** Same shape as app/create/page.tsx:160-199: build newErrors, set it, return
   *  whether the form may submit. Required: business_name, business_type and
   *  address -- a gym with no address is not findable. */
  function validate(): boolean {
    const newErrors: PartnerApplyErrors = {};
    if (!businessName.trim()) newErrors.business_name = t('errBusinessNameRequired');
    if (!businessType) newErrors.business_type = t('errBusinessTypeRequired');
    if (!address.trim()) newErrors.address = t('errAddressRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  /** Postgres speaks in constraint names. Users do not. */
  function submitErrorMessage(raw: string | undefined): string {
    const msg = (raw ?? '').toLowerCase();
    if (msg.includes('featured_partners_user_id_key') || msg.includes('duplicate key')) {
      return t('duplicateApplication');
    }
    if (msg.includes('violates check constraint') || msg.includes('_check')) {
      return t('invalidValue');
    }
    return raw || t('submitFailed');
  }

  /** Non-fatal by design: the application or activation already happened, and a
   *  failed bell must not look like a failed submit. */
  async function notifyAdmins(message: string, entityId: string | null, type: string) {
    if (!userId) return;
    const adminResult = await fetchAdminUserIds(supabase);
    if (!adminResult.success || !adminResult.data) return;
    for (const adminId of adminResult.data) {
      const bell = await createNotification(supabase, {
        recipient_id: adminId,
        actor_id: userId,
        type,
        entity_type: 'featured_partner',
        entity_id: entityId,
        message,
      });
      if (!bell.success) {
        logError(new Error(bell.error ?? 'createNotification failed'), {
          action: 'partners_apply_notify_admin',
          adminId,
          type,
        });
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || submitting) return;
    // The old guard was `if (!userId || !businessName.trim()) return;` -- it
    // returned silently, so an empty required field was indistinguishable from
    // a broken button.
    if (!validate()) return;

    setSubmitting(true);
    const result = await applyForPartnership(supabase, userId, {
      business_name: businessName.trim(),
      business_type: businessType,
      description: description.trim() || undefined,
      description_es: descriptionEs.trim() || undefined,
      specialties: selectedSpecialties,
      address: address.trim() || undefined,
      website_url: website.trim() || undefined,
      phone: phone.trim() || undefined,
    });

    setSubmitting(false);

    if (result.success) {
      setSubmitted(true);
      // Refresh the partner record so the activation prompt appears
      if (result.data) {
        setExistingPartner(result.data);
      }
      showSuccess(t('submitSuccess'));
      await notifyAdmins(
        `New partner application: ${businessName.trim()}`,
        result.data?.id ?? null,
        'partner_application'
      );
    } else {
      showError(submitErrorMessage(result.error));
    }
  }

  async function handleActivate() {
    setActivating(true);
    const result = await selfActivatePartner(supabase);
    setActivating(false);

    if (!result.success) {
      const errMsg =
        result.error === 'no_application'
          ? t('activateNoApplication')
          : result.error === 'invalid_status'
            ? t('activateInvalidStatus')
            : t('activateFailed');
      showError(errMsg);
      return;
    }

    if (result.data?.alreadyActive) {
      showInfo(t('alreadyActive'));
      router.push('/dashboard/partner');
      return;
    }

    showSuccess(t('activateSuccess'));

    // Self-activation bypasses the admin queue by design (the beta offer), so
    // the notification is what keeps it visible. Without it an account can go
    // live with nothing telling an admin it happened. Non-fatal, and awaited
    // before navigating so the push does not unmount mid-request.
    await notifyAdmins(
      `Partner self-activated: ${existingPartner?.business_name ?? 'unknown'}`,
      existingPartner?.id ?? null,
      'partner_activated'
    );

    router.push('/dashboard/partner');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark flex items-center justify-center">
        <Loader className="w-8 h-8 text-tribe-green animate-spin" />
      </div>
    );
  }

  const isPending = existingPartner?.status === 'pending' || existingPartner?.status === 'paused';
  const isActive = existingPartner?.status === 'active';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center gap-3 px-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </button>
          <h1 className="text-lg font-bold text-stone-900 dark:text-white">{t('applyTitle')}</h1>
        </div>
      </div>

      <div className="pt-[72px] max-w-2xl md:max-w-4xl mx-auto px-4">
        {/* Load failed. Rendering ANYTHING else here is a guess: the form would
            be shown to someone who may already have a row, and the guard below
            would tell an instructor they are not one. */}
        {loadFailed && (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">{t('loadFailedTitle')}</p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60 mb-6">{t('loadFailedBody')}</p>
            <button
              onClick={() => load()}
              className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-sm hover:bg-lime-500 transition"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {/* Gym account not enabled. This used to be a dead end: a gym owner who
            picked "I Want to Train" at /onboarding/role landed here and there
            was nothing on the screen that could clear it. The button performs
            the same write the role cards do, then reloads in place. */}
        {!loadFailed && !isInstructor && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏋️</div>
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">{t('instructorRequiredTitle')}</p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60 mb-6">{t('instructorRequiredBody')}</p>
            <button
              onClick={handleEnableGymAccount}
              disabled={enabling}
              className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-sm hover:bg-lime-500 transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {enabling && <Loader className="w-4 h-4 animate-spin" />}
              {t('instructorRequiredCta')}
            </button>
          </div>
        )}

        {/* Already active: go to dashboard */}
        {!loadFailed && isInstructor && isActive && (
          <div className="text-center py-12">
            <Star className="w-16 h-16 text-tribe-green mx-auto mb-4 fill-tribe-green/20" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">{t('activeTitle')}</p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60 mb-6">{t('activeBody')}</p>
            <button
              onClick={() => router.push('/dashboard/partner')}
              className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-sm hover:bg-lime-500 transition"
            >
              {t('goToDashboard')}
            </button>
          </div>
        )}

        {/* Pending application: show beta activation CTA */}
        {!loadFailed && isInstructor && isPending && (
          <div className="py-6 space-y-5">
            <div className="bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-tribe-mid p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-tribe-green" />
                <p className="font-bold text-stone-900 dark:text-white">{t('submittedTitle')}</p>
              </div>
              <p className="text-sm text-stone-500 dark:text-tribe-gray-60">
                {t('submittedBusiness', { name: existingPartner?.business_name ?? '' })}
              </p>
            </div>

            {/* Beta free activation card */}
            <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tribe-green/20 mb-3">
                <Zap className="w-6 h-6 text-tribe-green" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-1">{t('activateTitle')}</h3>
              <p className="text-sm text-stone-600 dark:text-tribe-gray-60 mb-4">{t('activateBody')}</p>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-base hover:bg-lime-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {activating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('activating')}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {t('activateCta')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success state after submitting the form for the first time */}
        {!loadFailed && submitted && !isPending && !isActive && (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-tribe-green mx-auto mb-4" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">{t('successTitle')}</p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60">{t('successBody')}</p>
          </div>
        )}

        {/* Form: only show when no existing partner record and not yet submitted */}
        {!loadFailed && isInstructor && !existingPartner && !submitted && (
          <PartnerApplyForm
            businessName={businessName}
            setBusinessName={setBusinessName}
            businessType={businessType}
            setBusinessType={setBusinessType}
            description={description}
            setDescription={setDescription}
            descriptionEs={descriptionEs}
            setDescriptionEs={setDescriptionEs}
            selectedSpecialties={selectedSpecialties}
            toggleSpecialty={toggleSpecialty}
            address={address}
            setAddress={setAddress}
            website={website}
            setWebsite={setWebsite}
            phone={phone}
            setPhone={setPhone}
            submitting={submitting}
            onSubmit={handleSubmit}
            errors={errors}
            clearError={clearError}
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}
