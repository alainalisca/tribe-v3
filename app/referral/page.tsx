/** Page: /referral — Referral hub with code, share buttons, stats, and reward tiers */
'use client';

import Link from 'next/link';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getOrCreateReferralCode, getReferralStats } from '@/lib/dal/referrals';
import { shareViaWhatsApp } from '@/lib/share';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ReferralPage() {
  const { language } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [friendsInvited, setFriendsInvited] = useState(0);
  const [rewardsEarned, setRewardsEarned] = useState(0);

  // Text translations
  const txt = {
    en: {
      inviteFriends: 'Invite Friends',
      referralCode: 'Your Referral Code',
      copyCode: 'Copy Code',
      codeCopied: 'Copied!',
      shareVia: 'Share Your Code',
      copyLink: 'Copy Link',
      shareWhatsApp: 'Share via WhatsApp',
      share: 'Share',
      friendsInvited: 'Friends Invited',
      rewardsEarned: 'Rewards Earned',
      howItWorks: 'How It Works',
      howItWorksDesc: 'For every friend who joins and completes their first session, you both earn a reward',
      rewardTiers: 'Reward Tiers',
      freePromo: 'Free promo code (10% off next session)',
      featuredProfile: 'Featured profile for 1 week',
      freeBoost: 'Free boost campaign',
      proStorefront: '1 month Pro storefront',
      referralLink: 'Referral Link',
    },
    es: {
      inviteFriends: 'Invitar Amigos',
      referralCode: 'Tu Código de Referencia',
      copyCode: 'Copiar Código',
      codeCopied: '¡Copiado!',
      shareVia: 'Comparte Tu Código',
      copyLink: 'Copiar Enlace',
      shareWhatsApp: 'Compartir por WhatsApp',
      share: 'Compartir',
      friendsInvited: 'Amigos Invitados',
      rewardsEarned: 'Recompensas Ganadas',
      howItWorks: 'Cómo Funciona',
      howItWorksDesc: 'Por cada amigo que se una y complete su primera sesión, ambos ganan una recompensa',
      rewardTiers: 'Niveles de Recompensa',
      freePromo: 'Código de promoción gratis (10% de descuento en la próxima sesión)',
      featuredProfile: 'Perfil destacado por 1 semana',
      freeBoost: 'Campaña de impulso gratis',
      proStorefront: 'Escaparate Pro por 1 mes',
      referralLink: 'Enlace de Referencia',
    },
  };

  const t = txt[language as keyof typeof txt] || txt.en;

  useEffect(() => {
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadUserData() {
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (authUser) {
        setUserId(authUser.id);

        // Get or create referral code via DAL
        const codeResult = await getOrCreateReferralCode(supabase, authUser.id);
        if (codeResult.success && codeResult.data) {
          setReferralCode(codeResult.data);
        }

        // Fetch real referral stats via DAL
        const statsResult = await getReferralStats(supabase, authUser.id);
        if (statsResult.success && statsResult.data) {
          setFriendsInvited(statsResult.data.total);
          setRewardsEarned(statsResult.data.rewarded);
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }

  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/auth?ref=${referralCode}` : '';

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const url = referralLink;
    const message =
      language === 'es'
        ? `Estoy entrenando con Tribe en Medellín — sesiones de running, yoga, fuerza y más. Usa mi código ${referralCode} cuando te registres y ambos ganamos una recompensa.`
        : `I've been training with Tribe in Medellín — running, yoga, strength sessions and more. Use my code ${referralCode} when you sign up and we both earn a reward.`;
    shareViaWhatsApp(message, url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Tribe',
          text:
            language === 'es'
              ? `Entrena conmigo en Medellín con Tribe — running, yoga, fuerza y más. Usa mi código ${referralCode} al registrarte y ambos ganamos una recompensa.`
              : `Train with me in Medellín on Tribe — running, yoga, strength and more. Use my code ${referralCode} when you sign up and we both earn a reward.`,
          url: referralLink,
        });
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('Share failed:', err);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-stone-200 dark:border-gray-700">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <Link href="/profile">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-tribe-green" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.inviteFriends}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Referral Code Section */}
        <div className="bg-white dark:bg-tribe-card rounded-2xl p-6 border border-stone-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">{t.referralCode}</h2>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-stone-100 dark:bg-tribe-surface rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-tribe-green font-mono">{referralCode}</p>
            </div>
            <button
              onClick={handleCopyCode}
              className="bg-tribe-green text-slate-900 p-3 rounded-xl hover:bg-tribe-green-hover transition font-semibold flex items-center gap-2"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Share Buttons Section */}
        <div className="bg-white dark:bg-tribe-card rounded-2xl p-6 border border-stone-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">{t.shareVia}</h2>
          <div className="space-y-3">
            <button
              onClick={handleCopyLink}
              className="w-full p-4 rounded-xl text-left font-semibold bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center gap-2"
            >
              <Copy className="w-5 h-5 text-tribe-green" />
              {t.copyLink}
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="w-full p-4 rounded-xl text-left font-semibold bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center gap-2"
            >
              <span className="text-xl">💬</span>
              {t.shareWhatsApp}
            </button>
            {'share' in navigator && (
              <button
                onClick={handleShare}
                className="w-full p-4 rounded-xl text-left font-semibold bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center gap-2"
              >
                <span className="text-xl">↗️</span>
                {t.share}
              </button>
            )}
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-tribe-card rounded-2xl p-4 border border-stone-200 dark:border-gray-700 text-center">
            <p className="text-3xl font-bold text-tribe-green mb-2">{friendsInvited}</p>
            <p className="text-sm text-stone-600 dark:text-gray-400">{t.friendsInvited}</p>
          </div>
          <div className="bg-white dark:bg-tribe-card rounded-2xl p-4 border border-stone-200 dark:border-gray-700 text-center">
            <p className="text-3xl font-bold text-tribe-green mb-2">{rewardsEarned}</p>
            <p className="text-sm text-stone-600 dark:text-gray-400">{t.rewardsEarned}</p>
          </div>
        </div>

        {/* How It Works Card */}
        <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-3">{t.howItWorks}</h3>
          <p className="text-stone-700 dark:text-gray-300">{t.howItWorksDesc}</p>
        </div>

        {/* Reward Tiers Section */}
        <div className="bg-white dark:bg-tribe-card rounded-2xl p-6 border border-stone-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-4">{t.rewardTiers}</h3>
          <div className="space-y-3">
            {/* Tier 1 */}
            <div className="flex items-start gap-3 pb-3 border-b border-stone-200 dark:border-gray-700">
              <div className="flex-shrink-0 w-8 h-8 bg-tribe-green text-slate-900 rounded-full flex items-center justify-center font-bold text-sm">
                1
              </div>
              <p className="text-stone-700 dark:text-gray-300">{t.freePromo}</p>
            </div>

            {/* Tier 3 */}
            <div className="flex items-start gap-3 pb-3 border-b border-stone-200 dark:border-gray-700">
              <div className="flex-shrink-0 w-8 h-8 bg-tribe-green text-slate-900 rounded-full flex items-center justify-center font-bold text-sm">
                3
              </div>
              <p className="text-stone-700 dark:text-gray-300">{t.featuredProfile}</p>
            </div>

            {/* Tier 5 */}
            <div className="flex items-start gap-3 pb-3 border-b border-stone-200 dark:border-gray-700">
              <div className="flex-shrink-0 w-8 h-8 bg-tribe-green text-slate-900 rounded-full flex items-center justify-center font-bold text-sm">
                5
              </div>
              <p className="text-stone-700 dark:text-gray-300">{t.freeBoost}</p>
            </div>

            {/* Tier 10 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-tribe-green text-slate-900 rounded-full flex items-center justify-center font-bold text-sm">
                10
              </div>
              <p className="text-stone-700 dark:text-gray-300">{t.proStorefront}</p>
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
