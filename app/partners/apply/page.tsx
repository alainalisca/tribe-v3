'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { applyForPartnership, fetchPartnerByUserId, selfActivatePartner } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import { createNotification, fetchAdminUserIds } from '@/lib/dal';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import PartnerApplyForm from '@/components/partner/PartnerApplyForm';
import { ArrowLeft, Loader, CheckCircle, Star, Zap } from 'lucide-react';

export default function PartnerApplyPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [userId, setUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
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

  useEffect(() => {
    async function checkAuth() {
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
      }
      setIsInstructor(!!profile?.is_instructor);

      const result = await fetchPartnerByUserId(supabase, user.id);
      if (result.success && result.data) {
        setExistingPartner(result.data);
      }
      setLoading(false);
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSpecialty(s: string) {
    setSelectedSpecialties((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !businessName.trim()) return;

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
      showSuccess(language === 'es' ? 'Solicitud enviada' : 'Application submitted');

      // Notify admin(s) about the new application
      const adminResult = await fetchAdminUserIds(supabase);
      if (adminResult.success && adminResult.data) {
        for (const adminId of adminResult.data) {
          await createNotification(supabase, {
            recipient_id: adminId,
            actor_id: userId,
            type: 'partner_application',
            entity_type: 'featured_partner',
            entity_id: result.data?.id ?? null,
            message: `New partner application: ${businessName.trim()}`,
          });
        }
      }
    } else {
      showError(result.error || (language === 'es' ? 'Error al enviar' : 'Failed to submit'));
    }
  }

  async function handleActivate() {
    setActivating(true);
    const result = await selfActivatePartner(supabase);
    setActivating(false);

    if (!result.success) {
      const errMsg =
        result.error === 'no_application'
          ? t('No application found. Please apply first.', 'No se encontró una solicitud. Aplica primero.')
          : result.error === 'invalid_status'
            ? t('Your application cannot be activated right now.', 'Tu solicitud no puede activarse en este momento.')
            : t('Activation failed. Please try again.', 'La activación falló. Intenta de nuevo.');
      showError(errMsg);
      return;
    }

    if (result.data?.alreadyActive) {
      showInfo(t('Your profile is already featured and active.', 'Tu perfil ya está destacado y activo.'));
      router.push('/dashboard/partner');
      return;
    }

    showSuccess(
      t(
        'Featured instructor activated! Your profile is now live.',
        '¡Instructor destacado activado! Tu perfil ya está publicado.'
      )
    );
    // Redirect to the partner dashboard
    router.push('/dashboard/partner');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark flex items-center justify-center">
        <Loader className="w-8 h-8 text-tribe-green animate-spin" />
      </div>
    );
  }

  const t = (en: string, es: string) => (language === 'es' ? es : en);

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
          <h1 className="text-lg font-bold text-stone-900 dark:text-white">
            {t('Affiliate Application', 'Solicitud de Afiliado')}
          </h1>
        </div>
      </div>

      <div className="pt-[72px] max-w-2xl md:max-w-4xl mx-auto px-4">
        {/* Guard: not an instructor */}
        {!isInstructor && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏋️</div>
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Instructor Account Required', 'Cuenta de Instructor Requerida')}
            </p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60 mb-4">
              {t('You need an instructor account to apply.', 'Necesitas una cuenta de instructor para aplicar.')}
            </p>
          </div>
        )}

        {/* Already active: go to dashboard */}
        {isInstructor && isActive && (
          <div className="text-center py-12">
            <Star className="w-16 h-16 text-tribe-green mx-auto mb-4 fill-tribe-green/20" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Featured Instructor — Active', 'Instructor Destacado — Activo')}
            </p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60 mb-6">
              {t('Your profile is live and featured in the app.', 'Tu perfil está publicado y destacado en la app.')}
            </p>
            <button
              onClick={() => router.push('/dashboard/partner')}
              className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-sm hover:bg-lime-500 transition"
            >
              {t('Go to Dashboard', 'Ir al Panel')}
            </button>
          </div>
        )}

        {/* Pending application: show beta activation CTA */}
        {isInstructor && isPending && (
          <div className="py-6 space-y-5">
            <div className="bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-tribe-mid p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-tribe-green" />
                <p className="font-bold text-stone-900 dark:text-white">
                  {t('Application Submitted', 'Solicitud Enviada')}
                </p>
              </div>
              <p className="text-sm text-stone-500 dark:text-tribe-gray-60">
                {t(`Business: ${existingPartner?.business_name}`, `Negocio: ${existingPartner?.business_name}`)}
              </p>
            </div>

            {/* Beta free activation card */}
            <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tribe-green/20 mb-3">
                <Zap className="w-6 h-6 text-tribe-green" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-1">
                {t('Activate Now — Free for 6 Months', 'Activar Ahora — Gratis por 6 Meses')}
              </h3>
              <p className="text-sm text-stone-600 dark:text-tribe-gray-60 mb-4">
                {t(
                  'Introductory beta offer: get featured immediately at no cost. Your profile will appear in the home feed and discovery for 6 months.',
                  'Oferta beta introductoria: destácate de inmediato sin costo. Tu perfil aparecerá en el feed principal y en búsqueda por 6 meses.'
                )}
              </p>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-base hover:bg-lime-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {activating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {t('Activating...', 'Activando...')}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {t('Get Featured — Free', 'Destacarme — Gratis')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Success state after submitting the form for the first time */}
        {submitted && !isPending && !isActive && (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-tribe-green mx-auto mb-4" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Application Submitted!', 'Solicitud Enviada!')}
            </p>
            <p className="text-sm text-stone-500 dark:text-tribe-gray-60">
              {t("We'll review within 48 hours.", 'La revisaremos dentro de 48 horas.')}
            </p>
          </div>
        )}

        {/* Form: only show when no existing partner record and not yet submitted */}
        {isInstructor && !existingPartner && !submitted && (
          <PartnerApplyForm
            language={language}
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
          />
        )}
      </div>
      <BottomNav />
    </div>
  );
}
