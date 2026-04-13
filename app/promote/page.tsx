'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { Megaphone, Eye, Users, Zap, Tag, Store, Bell, Crown, ArrowRight, ArrowLeft, AlertCircle } from 'lucide-react';

interface UserStats {
  follower_count: number;
  storefront_tier: string;
}

interface PromoteStats {
  profile_views: number;
  followers: number;
  active_boosts: number;
  active_promos: number;
  user_id: string;
  storefront_tier: string;
}

export default function PromotePage() {
  const { language } = useLanguage();
  const supabase = createClient();
  const [stats, setStats] = useState<PromoteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);

  const t = {
    pageTitle: language === 'es' ? 'Tribe Promoción' : 'Tribe Promote',
    subtitle: language === 'es' ? 'Tu centro de marketing' : 'Your marketing hub',
    profileViews: language === 'es' ? 'Vistas de Perfil' : 'Profile Views',
    followers: language === 'es' ? 'Seguidores' : 'Followers',
    activeBoosts: language === 'es' ? 'Impulsos Activos' : 'Active Boosts',
    activePromos: language === 'es' ? 'Promos Activas' : 'Active Promos',
    storefront: language === 'es' ? 'Escaparate' : 'Storefront',
    storefrontDesc: language === 'es' ? 'Personaliza tu perfil' : 'Customize your profile',
    viewStorefront: language === 'es' ? 'Ver Escaparate' : 'View Storefront',
    edit: language === 'es' ? 'Editar' : 'Edit',
    postsAnnouncements: language === 'es' ? 'Publicaciones y Anuncios' : 'Posts & Announcements',
    postsDesc: language === 'es' ? 'Comparte actualizaciones' : 'Share updates with followers',
    promoCodes: language === 'es' ? 'Códigos de Descuento' : 'Promo Codes',
    promoDesc: language === 'es' ? 'Crea códigos de descuento' : 'Create discount codes',
    boostCampaigns: language === 'es' ? 'Campañas de Impulso' : 'Boost Campaigns',
    boostDesc: language === 'es' ? 'Impulsa tus sesiones' : 'Promote your sessions',
    upgradePro: language === 'es' ? 'Mejora a Pro' : 'Upgrade to Pro',
    upgradeDesc:
      language === 'es'
        ? 'Desbloquea características premium para tu escaparate'
        : 'Unlock premium features for your storefront',
    benefits:
      language === 'es'
        ? 'Galería multimedia • Paquetes de servicios • Análisis • Ubicación prioritaria'
        : 'Media gallery • Service packages • Analytics • Priority placement',
    price: language === 'es' ? 'COP 39,900/mes' : '$9.99/month',
    upgradeBtn: language === 'es' ? 'Mejorar' : 'Upgrade',
    accessDenied: language === 'es' ? 'Acceso denegado' : 'Access Denied',
    instructorOnly:
      language === 'es' ? 'Solo instructores pueden acceder a esta página' : 'Only instructors can access this page',
    posts: language === 'es' ? 'publicaciones' : 'posts',
    codes: language === 'es' ? 'códigos' : 'codes',
    campaigns: language === 'es' ? 'campañas' : 'campaigns',
  };

  useEffect(() => {
    const checkAuthAndLoadStats = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        setUserId(user.id);

        // Fetch user profile to check if instructor
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('is_instructor, follower_count, storefront_tier')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Profile error:', profileError);
          setError('Failed to load profile');
          setLoading(false);
          return;
        }

        if (!userProfile?.is_instructor) {
          setIsInstructor(false);
          setLoading(false);
          return;
        }

        setIsInstructor(true);

        // Fetch active boosts count
        const { data: boosts, error: boostsError } = await supabase
          .from('boost_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('instructor_id', user.id)
          .eq('status', 'active');

        // Fetch active promos count
        const { data: promos, error: promosError } = await supabase
          .from('promo_codes')
          .select('id', { count: 'exact', head: true })
          .eq('instructor_id', user.id)
          .eq('is_active', true);

        setStats({
          profile_views: userProfile?.follower_count || 0,
          followers: userProfile?.follower_count || 0,
          active_boosts: boosts?.length || 0,
          active_promos: promos?.length || 0,
          user_id: user.id,
          storefront_tier: userProfile?.storefront_tier || 'free',
        });

        setLoading(false);
      } catch (err) {
        console.error('Error loading stats:', err);
        setError('Failed to load data');
        setLoading(false);
      }
    };

    checkAuthAndLoadStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-tribe-green mx-auto mb-4"></div>
          <p className="text-theme-primary">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!isInstructor) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center px-4">
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-8 max-w-md text-center border border-stone-200 dark:border-gray-700">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2 text-theme-primary">{t.accessDenied}</h1>
          <p className="text-theme-secondary mb-6">{t.instructorOnly}</p>
          <Link
            href="/"
            className="inline-block bg-tribe-green text-slate-900 font-semibold px-6 py-2 rounded-xl hover:bg-tribe-green transition-colors"
          >
            {language === 'es' ? 'Ir a Inicio' : 'Go Home'}
          </Link>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center px-4">
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-8 max-w-md text-center border border-stone-200 dark:border-gray-700">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2 text-theme-primary">{language === 'es' ? 'Error' : 'Error'}</h1>
          <p className="text-theme-secondary">{error || 'Failed to load data'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link
            href="/profile"
            className="flex items-center gap-2 text-tribe-green hover:text-tribe-green transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{language === 'es' ? 'Perfil' : 'Profile'}</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Page Title Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Megaphone className="w-8 h-8 text-tribe-green" />
            <h1 className="text-3xl font-bold text-theme-primary">{t.pageTitle}</h1>
          </div>
          <p className="text-theme-secondary text-base">{t.subtitle}</p>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Profile Views Card */}
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-theme-secondary text-xs">{t.profileViews}</p>
              <Eye className="w-4 h-4 text-tribe-green" />
            </div>
            <p className="text-2xl font-bold text-theme-primary">{stats.profile_views}</p>
          </div>

          {/* Followers Card */}
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-theme-secondary text-xs">{t.followers}</p>
              <Users className="w-4 h-4 text-tribe-green" />
            </div>
            <p className="text-2xl font-bold text-theme-primary">{stats.followers}</p>
          </div>

          {/* Active Boosts Card */}
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-theme-secondary text-xs">{t.activeBoosts}</p>
              <Zap className="w-4 h-4 text-tribe-green" />
            </div>
            <p className="text-2xl font-bold text-theme-primary">{stats.active_boosts}</p>
          </div>

          {/* Active Promos Card */}
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-theme-secondary text-xs">{t.activePromos}</p>
              <Tag className="w-4 h-4 text-tribe-green" />
            </div>
            <p className="text-2xl font-bold text-theme-primary">{stats.active_promos}</p>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Storefront Card */}
          <Link href={`/storefront/${stats.user_id}`}>
            <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 hover:border-tribe-green transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3 mb-3">
                <Store className="w-6 h-6 text-tribe-green flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-theme-primary">{t.storefront}</h3>
                  <p className="text-theme-secondary text-xs">{t.storefrontDesc}</p>
                </div>
              </div>
              <p className="text-theme-secondary text-sm mb-4">
                {language === 'es' ? 'Gestiona tu presencia en línea' : 'Manage your online presence'}
              </p>
              <div className="flex items-center gap-2 text-tribe-green font-semibold text-sm">
                <span>{t.viewStorefront}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>

          {/* Posts & Announcements Card */}
          <Link href="/promote/posts">
            <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 hover:border-tribe-green transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3 mb-3">
                <Bell className="w-6 h-6 text-tribe-green flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-theme-primary">{t.postsAnnouncements}</h3>
                  <p className="text-theme-secondary text-xs">{t.postsDesc}</p>
                </div>
              </div>
              <p className="text-theme-secondary text-sm mb-4">
                {language === 'es' ? 'Conecta con tus seguidores' : 'Connect with your followers'}
              </p>
              <div className="flex items-center gap-2 text-tribe-green font-semibold text-sm">
                <span>{language === 'es' ? 'Ir a Posts' : 'Go to Posts'}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>

          {/* Promo Codes Card */}
          <Link href="/promote/promo-codes">
            <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 hover:border-tribe-green transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3 mb-3">
                <Tag className="w-6 h-6 text-tribe-green flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-theme-primary">{t.promoCodes}</h3>
                  <p className="text-theme-secondary text-xs">{t.promoDesc}</p>
                </div>
              </div>
              <p className="text-theme-secondary text-sm mb-4">
                {language === 'es' ? 'Códigos activos: ' : 'Active codes: '}
                <span className="text-tribe-green font-bold">{stats.active_promos}</span>
              </p>
              <div className="flex items-center gap-2 text-tribe-green font-semibold text-sm">
                <span>{language === 'es' ? 'Gestionar' : 'Manage'}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>

          {/* Boost Campaigns Card */}
          <Link href="/promote/boosts">
            <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 hover:border-tribe-green transition-all cursor-pointer h-full">
              <div className="flex items-start gap-3 mb-3">
                <Zap className="w-6 h-6 text-tribe-green flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-theme-primary">{t.boostCampaigns}</h3>
                  <p className="text-theme-secondary text-xs">{t.boostDesc}</p>
                </div>
              </div>
              <p className="text-theme-secondary text-sm mb-4">
                {language === 'es' ? 'Campañas activas: ' : 'Active campaigns: '}
                <span className="text-tribe-green font-bold">{stats.active_boosts}</span>
              </p>
              <div className="flex items-center gap-2 text-tribe-green font-semibold text-sm">
                <span>{language === 'es' ? 'Gestionar' : 'Manage'}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        </div>

        {/* Pro Storefront Upgrade Banner */}
        {stats.storefront_tier === 'free' && (
          <div className="bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-5 border border-tribe-green/30">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <Crown className="w-6 h-6 text-tribe-green flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-theme-primary mb-1">{t.upgradePro}</h3>
                  <p className="text-theme-secondary text-sm mb-2">{t.upgradeDesc}</p>
                  <p className="text-tribe-green text-xs font-medium">{t.benefits}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between pt-2 border-t border-tribe-green/20">
                <p className="text-2xl font-bold text-tribe-green">{t.price}</p>
                <button
                  onClick={() => {
                    alert(
                      language === 'es' ? 'La función de mejora está en desarrollo' : 'Upgrade feature coming soon'
                    );
                  }}
                  className="bg-tribe-green text-slate-900 hover:bg-tribe-green font-semibold px-6 py-2 rounded-xl transition-colors whitespace-nowrap"
                >
                  {t.upgradeBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
