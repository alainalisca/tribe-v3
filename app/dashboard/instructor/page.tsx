'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Store, Calendar, BarChart3, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import BottomNav from '@/components/BottomNav';
import StorefrontEditor from '@/components/dashboard/StorefrontEditor';
import SessionManager from '@/components/dashboard/SessionManager';
import InstructorAnalytics from '@/components/dashboard/InstructorAnalytics';
import PackageManager from '@/components/dashboard/PackageManager';
import {
  fetchInstructorSessions,
  fetchInstructorStats,
  fetchDashboardPackages,
  type InstructorSessionRow,
  type InstructorStats,
  type ServicePackageRow,
} from '@/lib/dal/instructorDashboard';
import type { User } from '@/lib/database.types';

type Tab = 'storefront' | 'sessions' | 'analytics' | 'packages';

export default function InstructorDashboardPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('storefront');
  const [upcoming, setUpcoming] = useState<InstructorSessionRow[]>([]);
  const [past, setPast] = useState<InstructorSessionRow[]>([]);
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [packages, setPackages] = useState<ServicePackageRow[]>([]);

  const txt = {
    title: language === 'es' ? 'Panel del Instructor' : 'Instructor Dashboard',
    storefront: language === 'es' ? 'Vitrina' : 'Storefront',
    sessions: language === 'es' ? 'Sesiones' : 'Sessions',
    analytics: language === 'es' ? 'Estadisticas' : 'Analytics',
    packages: language === 'es' ? 'Paquetes' : 'Packages',
  };

  const tabs: { key: Tab; label: string; icon: typeof Store }[] = [
    { key: 'storefront', label: txt.storefront, icon: Store },
    { key: 'sessions', label: txt.sessions, icon: Calendar },
    { key: 'analytics', label: txt.analytics, icon: BarChart3 },
    { key: 'packages', label: txt.packages, icon: Package },
  ];

  useEffect(() => {
    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/profile');
        return;
      }

      const { data: userRow, error } = await supabase.from('users').select('*').eq('id', authUser.id).single();

      if (error || !userRow?.is_instructor) {
        router.replace('/profile');
        return;
      }
      setProfile(userRow as User);

      // Load all data in parallel
      const [sessResult, statsResult, pkgResult] = await Promise.all([
        fetchInstructorSessions(supabase, authUser.id),
        fetchInstructorStats(supabase, authUser.id),
        fetchDashboardPackages(supabase, authUser.id),
      ]);

      if (sessResult.success && sessResult.data) {
        setUpcoming(sessResult.data.upcoming);
        setPast(sessResult.data.past);
      }
      if (statsResult.success && statsResult.data) setStats(statsResult.data);
      if (pkgResult.success && pkgResult.data) setPackages(pkgResult.data);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/profile">
              <button className="p-1.5 hover:bg-stone-200 dark:hover:bg-tribe-surface rounded-lg transition">
                <ArrowLeft className="w-5 h-5 text-theme-primary" />
              </button>
            </Link>
            <h1 className="text-lg font-bold text-theme-primary">{txt.title}</h1>
          </div>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto px-4">
        {/* Tab Bar */}
        <div className="mt-4 flex gap-1 bg-white dark:bg-tribe-surface rounded-xl p-1 border border-stone-200 dark:border-tribe-mid">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition ${
                  isActive ? 'bg-tribe-green text-slate-900' : 'text-theme-secondary hover:text-theme-primary'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'storefront' && profile && (
            <StorefrontEditor
              userId={profile.id}
              language={language as 'en' | 'es'}
              initialBio={profile.instructor_bio || profile.bio || ''}
              initialTagline={profile.storefront_tagline || ''}
              initialSpecialties={(profile.specialties as string[]) || []}
              initialBannerUrl={profile.storefront_banner_url || ''}
            />
          )}

          {activeTab === 'sessions' && (
            <SessionManager language={language as 'en' | 'es'} upcoming={upcoming} past={past} />
          )}

          {activeTab === 'analytics' && stats && (
            <InstructorAnalytics language={language as 'en' | 'es'} stats={stats} />
          )}

          {activeTab === 'packages' && profile && (
            <PackageManager language={language as 'en' | 'es'} userId={profile.id} initialPackages={packages} />
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
