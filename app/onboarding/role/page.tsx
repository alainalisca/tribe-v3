/** Page: /onboarding/role — Account type selection for new users */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { consumePendingReturnTo } from '@/lib/pendingReturnTo';
import { enableInstructorAccount } from '@/lib/dal';
import { useTranslations } from '@/lib/i18n/useTranslations';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  Dumbbell,
  GraduationCap,
  ArrowRight,
  Users,
  Calendar,
  Star,
  DollarSign,
  Megaphone,
  TrendingUp,
  Building2,
  MapPin,
  CalendarCheck,
} from 'lucide-react';

const getTranslations = (language: 'en' | 'es') => ({
  welcome: language === 'es' ? '¡Bienvenido a Tribe!' : 'Welcome to Tribe!',
  subtitle: language === 'es' ? '¿Cómo usarás la plataforma?' : 'How will you use the platform?',
  athleteTitle: language === 'es' ? 'Quiero Entrenar' : 'I Want to Train',
  athleteDesc:
    language === 'es'
      ? 'Descubre sesiones, conecta con instructores y entrena con tu tribu'
      : 'Discover sessions, connect with instructors, and train with your tribe',
  athleteFeature1: language === 'es' ? 'Buscar sesiones cercanas' : 'Find nearby sessions',
  athleteFeature2: language === 'es' ? 'Seguir instructores favoritos' : 'Follow favorite instructors',
  athleteFeature3: language === 'es' ? 'Conectar con tu comunidad' : 'Connect with your community',
  instructorTitle: language === 'es' ? 'Quiero Enseñar' : 'I Want to Teach',
  instructorDesc:
    language === 'es'
      ? 'Crea sesiones, construye tu marca y genera ingresos con tu conocimiento'
      : 'Create sessions, build your brand, and earn income with your expertise',
  instructorFeature1: language === 'es' ? 'Tu propia vitrina profesional' : 'Your own professional storefront',
  instructorFeature2: language === 'es' ? 'Cobrar por sesiones y servicios' : 'Charge for sessions & services',
  instructorFeature3: language === 'es' ? 'Promocionar y crecer tu audiencia' : 'Promote and grow your audience',
  getStarted: language === 'es' ? 'Empezar' : 'Get Started',
  canChangeLater:
    language === 'es' ? 'Puedes cambiar esto después en tu perfil' : 'You can always change this later in your profile',
});

export default function OnboardingRolePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const supabase = createClient();

  const tGym = useTranslations('gymSignup');
  const [selectedRole, setSelectedRole] = useState<'participant' | 'instructor' | 'gym' | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Verify the user is authenticated
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/auth');
      } else {
        setLoading(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinue() {
    if (!selectedRole || submitting) return;
    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth');
        return;
      }

      if (selectedRole === 'instructor' || selectedRole === 'gym') {
        // Both paths set is_instructor first: it is what gates /partners/apply
        // and the instructor wizard, and a gym is a users row with the flag set
        // plus a featured_partners row -- there is no account_type column.
        //
        // enableInstructorAccount reports a 0-row write as a failure rather
        // than as { error: null }. Routing onward after a failed write is the
        // old bug: an instructor landed in the wizard without the flag, and a
        // gym owner would land on /partners/apply and hit its "account
        // required" guard with nothing on that screen able to clear it.
        const result = await enableInstructorAccount(supabase, user.id);

        if (!result.success) {
          logError(new Error(result.error ?? 'is_instructor update returned 0 rows'), {
            action: 'onboardingRoleSelection.instructorUpdate',
            userId: user.id,
            role: selectedRole,
          });
          showError(tGym('roleSaveFailed'));
          setSubmitting(false);
          return;
        }

        // Trailing slash: next.config has trailingSlash: true, so /partners/apply
        // would otherwise 308 on the way in.
        router.push(selectedRole === 'gym' ? '/partners/apply/' : '/onboarding/instructor');
      } else {
        // Participant — onboarding ends here. A parked returnTo (T-C1 Gate 2:
        // the invite or shared link this signup started from) wins over the
        // default profile-edit landing; consuming clears it either way.
        router.push(consumePendingReturnTo() ?? '/profile/edit');
      }
    } catch (err) {
      logError(err, { action: 'onboardingRoleSelection' });
      showError(
        language === 'es'
          ? 'Algo salió mal. Intenta de nuevo en un momento.'
          : 'Something went wrong. Please try again in a moment.'
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center">
        <LoadingSpinner className="flex justify-center" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle atmospheric background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-25"
        style={{ backgroundImage: 'url(/marketing/onboarding-bg.jpg)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-50/95 via-stone-50/90 to-stone-50/95 dark:from-tribe-mid/95 dark:via-tribe-mid/90 dark:to-tribe-mid/95"
      />
      <div className="w-full max-w-lg space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-stone-900 dark:text-white">{t.welcome}</h1>
          <p className="text-stone-600 dark:text-gray-300 text-base">{t.subtitle}</p>
        </div>

        {/* Role Cards */}
        <div className="space-y-4">
          {/* Participant Card */}
          <button
            onClick={() => setSelectedRole('participant')}
            className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 ${
              selectedRole === 'participant'
                ? 'border-tribe-green bg-tribe-green/5 shadow-lg shadow-tribe-green/10'
                : 'border-stone-200 dark:border-gray-600 bg-white dark:bg-tribe-card hover:border-stone-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedRole === 'participant'
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-tribe-mid text-stone-500 dark:text-gray-400'
                }`}
              >
                <Dumbbell className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-1">{t.athleteTitle}</h2>
                <p className="text-sm text-stone-600 dark:text-gray-300 mb-3">{t.athleteDesc}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <Calendar className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.athleteFeature1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <Star className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.athleteFeature2}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <Users className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.athleteFeature3}</span>
                  </div>
                </div>
              </div>
              {/* Selection indicator */}
              <div
                className={`w-6 h-6 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition ${
                  selectedRole === 'participant'
                    ? 'border-tribe-green bg-tribe-green'
                    : 'border-stone-300 dark:border-gray-500'
                }`}
              >
                {selectedRole === 'participant' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>

          {/* Instructor Card */}
          <button
            onClick={() => setSelectedRole('instructor')}
            className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 ${
              selectedRole === 'instructor'
                ? 'border-tribe-green bg-tribe-green/5 shadow-lg shadow-tribe-green/10'
                : 'border-stone-200 dark:border-gray-600 bg-white dark:bg-tribe-card hover:border-stone-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedRole === 'instructor'
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-tribe-mid text-stone-500 dark:text-gray-400'
                }`}
              >
                <GraduationCap className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-1">{t.instructorTitle}</h2>
                <p className="text-sm text-stone-600 dark:text-gray-300 mb-3">{t.instructorDesc}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <TrendingUp className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.instructorFeature1}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <DollarSign className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.instructorFeature2}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <Megaphone className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{t.instructorFeature3}</span>
                  </div>
                </div>
              </div>
              {/* Selection indicator */}
              <div
                className={`w-6 h-6 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition ${
                  selectedRole === 'instructor'
                    ? 'border-tribe-green bg-tribe-green'
                    : 'border-stone-300 dark:border-gray-500'
                }`}
              >
                {selectedRole === 'instructor' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>

          {/* Gym Card (T-GYM4). Sets the same is_instructor flag as the
              instructor card and then routes to the application form that
              already exists, rather than adding a second onboarding route. */}
          <button
            onClick={() => setSelectedRole('gym')}
            className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 ${
              selectedRole === 'gym'
                ? 'border-tribe-green bg-tribe-green/5 shadow-lg shadow-tribe-green/10'
                : 'border-stone-200 dark:border-gray-600 bg-white dark:bg-tribe-card hover:border-stone-300 dark:hover:border-gray-500'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Rounded SQUARE, not the circle/rounded-xl the two person cards
                  use: organisations are squares throughout the app (T-GYM1). */}
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedRole === 'gym'
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-tribe-mid text-stone-500 dark:text-gray-400'
                }`}
              >
                <Building2 className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-1">{tGym('roleTitle')}</h2>
                <p className="text-sm text-stone-600 dark:text-gray-300 mb-3">{tGym('roleDesc')}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <Building2 className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{tGym('roleFeature1')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <MapPin className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{tGym('roleFeature2')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-gray-400">
                    <CalendarCheck className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                    <span>{tGym('roleFeature3')}</span>
                  </div>
                </div>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition ${
                  selectedRole === 'gym' ? 'border-tribe-green bg-tribe-green' : 'border-stone-300 dark:border-gray-500'
                }`}
              >
                {selectedRole === 'gym' && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
              </div>
            </div>
          </button>
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!selectedRole || submitting}
          className={`w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-200 ${
            selectedRole
              ? 'bg-tribe-green text-slate-900 hover:bg-tribe-green active:scale-[0.98]'
              : 'bg-stone-200 dark:bg-stone-600 text-stone-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <LoadingSpinner className="w-5 h-5" />
          ) : (
            <>
              {t.getStarted}
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        {/* Disclaimer */}
        <p className="text-center text-xs text-stone-400 dark:text-gray-500">{t.canChangeLater}</p>
      </div>
    </div>
  );
}
