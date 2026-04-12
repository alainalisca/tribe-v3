'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { applyForPartnership, fetchPartnerByUserId } from '@/lib/dal/featuredPartners';
import { createNotification, fetchAdminUserIds } from '@/lib/dal';
import { showSuccess, showError } from '@/lib/toast';
import BottomNav from '@/components/BottomNav';
import PartnerApplyForm from '@/components/partner/PartnerApplyForm';
import { ArrowLeft, Loader, CheckCircle } from 'lucide-react';

export default function PartnerApplyPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [userId, setUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingPartner, setExistingPartner] = useState(false);

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

      const { data: profile } = await supabase.from('users').select('is_instructor').eq('id', user.id).single();

      setIsInstructor(!!profile?.is_instructor);

      const result = await fetchPartnerByUserId(supabase, user.id);
      if (result.success && result.data) {
        setExistingPartner(true);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#272D34] flex items-center justify-center">
        <Loader className="w-8 h-8 text-tribe-green animate-spin" />
      </div>
    );
  }

  const t = (en: string, es: string) => (language === 'es' ? es : en);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#272D34] pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-[#2C3137] border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
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

      <div className="pt-[72px] max-w-2xl mx-auto px-4">
        {/* Guard: not an instructor */}
        {!isInstructor && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏋️</div>
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Instructor Account Required', 'Cuenta de Instructor Requerida')}
            </p>
            <p className="text-sm text-stone-500 dark:text-[#B1B3B6] mb-4">
              {t('You need an instructor account to apply.', 'Necesitas una cuenta de instructor para aplicar.')}
            </p>
          </div>
        )}

        {/* Guard: already applied */}
        {isInstructor && existingPartner && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Application Already Submitted', 'Solicitud Ya Enviada')}
            </p>
            <p className="text-sm text-stone-500 dark:text-[#B1B3B6]">
              {t('Your application is being reviewed.', 'Tu solicitud está siendo revisada.')}
            </p>
          </div>
        )}

        {/* Success state */}
        {submitted && (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-tribe-green mx-auto mb-4" />
            <p className="text-lg font-bold text-stone-900 dark:text-white mb-2">
              {t('Application Submitted!', 'Solicitud Enviada!')}
            </p>
            <p className="text-sm text-stone-500 dark:text-[#B1B3B6]">
              {t("We'll review within 48 hours.", 'La revisaremos dentro de 48 horas.')}
            </p>
          </div>
        )}

        {/* Form */}
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
