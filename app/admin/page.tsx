/** Page: /admin — Admin dashboard for managing users, sessions, reports, and feedback */
'use client';
import { useLanguage } from '@/lib/LanguageContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';
import { showError } from '@/lib/toast';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  AdminStats,
  UserManagement,
  ReportedMessages,
  FeedbackList,
  BugReports,
  MessageList,
  SessionManagement,
} from '@/components/admin';
import { SkeletonCard } from '@/components/Skeleton';
import { AdminRevenueTab } from '@/components/admin/AdminRevenueTab';
import type { User as AuthUser } from '@supabase/supabase-js';

import { useAdminData } from './useAdminData';
import { useAdminActions } from './useAdminActions';

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  // QA-14: surface pending-bulletin count so admin notices when submissions
  // are waiting. Fetched alongside main admin bootstrap below.
  const [pendingBulletinCount, setPendingBulletinCount] = useState(0);

  const data = useAdminData(supabase);
  const actions = useAdminActions(supabase, user?.id, language, t, {
    setUsers: data.setUsers,
    setReports: data.setReports,
    setFeedback: data.setFeedback,
    setBugs: data.setBugs,
    setSessions: data.setSessions,
    setMessages: data.setMessages,
  });

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      if (!adminResult.success || !adminResult.data) {
        showError(t('unauthorizedAccess'));
        router.push('/');
        return;
      }
      setUser(user);
      setAuthorized(true);
      await data.loadStats();
      // QA-14: surface pending bulletin count on the manage-bulletin card
      const { count: pendingCount } = await supabase
        .from('community_bulletin')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingBulletinCount(pendingCount ?? 0);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (activeTab === 'users') data.loadUsers();
    else if (activeTab === 'reports') data.loadReports();
    else if (activeTab === 'feedback') data.loadFeedback();
    else if (activeTab === 'bugs') data.loadBugs();
    else if (activeTab === 'messages') data.loadMessages();
    else if (activeTab === 'sessions') data.loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once per tab
  }, [activeTab]);

  const pendingReports = data.reports.filter((r) => r.status === 'pending');
  const pendingFeedback = data.feedback.filter((f) => f.status === 'pending');
  const pendingBugs = data.bugs.filter((b) => b.status === 'pending');

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark p-4">
        <div className="max-w-4xl mx-auto pt-20 space-y-4">
          <div className="h-8 w-48 bg-stone-200 dark:bg-tribe-mid rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!authorized) return null;

  if (data.error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark flex flex-col items-center justify-center p-4">
        <p className="text-stone-900 text-lg mb-4">{language === 'es' ? 'Algo salió mal' : 'Something went wrong'}</p>
        <Button onClick={data.loadStats} className="font-bold">
          {language === 'es' ? 'Intentar de nuevo' : 'Try Again'}
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: t('dashboard') },
    { id: 'users', label: t('users') },
    { id: 'reports', label: t('reportsList'), badge: pendingReports.length, badgeColor: 'bg-red-500' },
    { id: 'feedback', label: t('feedbackLabel'), badge: pendingFeedback.length, badgeColor: 'bg-blue-500' },
    { id: 'bugs', label: t('bugsLabel'), badge: pendingBugs.length, badgeColor: 'bg-orange-500' },
    { id: 'messages', label: t('messages') },
    { id: 'sessions', label: t('sessionsLabel') },
    { id: 'revenue', label: language === 'es' ? 'Ingresos' : 'Revenue' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark pb-32 safe-area-top">
      <div className="w-full max-w-md mx-auto px-3 py-4">
        <Link href="/settings" className="inline-flex items-center gap-1 text-stone-600 mb-3 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('back')}
        </Link>

        <h1 className="text-lg font-bold text-tribe-dark mb-1">{t('adminPanel')}</h1>
        <p className="text-xs text-stone-600 mb-4 truncate">{user?.email}</p>

        <div
          className="flex gap-1 mb-4 border-b border-stone-300 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap relative ${
                activeTab === tab.id ? 'border-b-2 border-tribe-green-light text-tribe-dark' : 'text-stone-600'
              }`}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span
                  className={`absolute -top-1 -right-1 ${tab.badgeColor} text-white text-xs rounded-full w-5 h-5 flex items-center justify-center`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <>
            <AdminStats stats={data.stats} />
            {/* Quick-access cards */}
            <div className="mt-4 space-y-3">
              <Link
                href="/admin/partners"
                className="flex items-center gap-3 w-full p-4 bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl hover:bg-stone-50 dark:hover:bg-tribe-surface transition"
              >
                <span className="text-2xl">🤝</span>
                <div>
                  <p className="text-sm font-bold text-tribe-dark">
                    {language === 'es' ? 'Gestionar Afiliados' : 'Manage Affiliates'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {language === 'es'
                      ? 'Aprobar, pausar y administrar afiliados destacados'
                      : 'Approve, pause, and manage featured affiliates'}
                  </p>
                </div>
              </Link>
              <Link
                href="/admin/bulletin"
                className="flex items-center gap-3 w-full p-4 bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl hover:bg-stone-50 dark:hover:bg-tribe-surface transition relative"
              >
                <svg className="w-6 h-6 text-tribe-green-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-tribe-dark dark:text-white">
                      {language === 'es' ? 'Gestionar Tablon' : 'Manage Bulletin'}
                    </p>
                    {pendingBulletinCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                        {pendingBulletinCount}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">
                    {pendingBulletinCount > 0
                      ? language === 'es'
                        ? `${pendingBulletinCount} ${pendingBulletinCount === 1 ? 'publicación pendiente' : 'publicaciones pendientes'} de revisión`
                        : `${pendingBulletinCount} post${pendingBulletinCount === 1 ? '' : 's'} awaiting review`
                      : language === 'es'
                        ? 'Revisar y aprobar publicaciones del tablon comunitario'
                        : 'Review and approve community bulletin posts'}
                  </p>
                </div>
              </Link>
              <Link
                href="/admin/events"
                className="flex items-center gap-3 w-full p-4 bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl hover:bg-stone-50 dark:hover:bg-tribe-surface transition"
              >
                <svg className="w-6 h-6 text-tribe-green-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-tribe-dark">
                    {language === 'es' ? 'Gestionar Eventos' : 'Manage Events'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {language === 'es'
                      ? 'Agregar y gestionar eventos fitness locales'
                      : 'Add and manage local fitness events'}
                  </p>
                </div>
              </Link>
            </div>
          </>
        )}
        {activeTab === 'users' && (
          <UserManagement
            users={data.users}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={data.loadingUsers}
            actionLoading={actions.actionLoading}
            onBan={actions.banUser}
            onUnban={actions.unbanUser}
            onDelete={actions.deleteUser}
          />
        )}
        {activeTab === 'reports' && (
          <ReportedMessages
            reports={data.reports}
            loading={data.loadingReports}
            language={language}
            onBanUser={actions.banUser}
            onUpdateStatus={actions.updateReportStatus}
          />
        )}
        {activeTab === 'feedback' && (
          <FeedbackList
            feedback={data.feedback}
            loading={data.loadingFeedback}
            language={language}
            onUpdateStatus={actions.updateFeedbackStatus}
          />
        )}
        {activeTab === 'bugs' && (
          <BugReports
            bugs={data.bugs}
            loading={data.loadingBugs}
            language={language}
            onUpdateStatus={actions.updateBugStatus}
          />
        )}
        {activeTab === 'messages' && (
          <MessageList
            messages={data.messages}
            loading={data.loadingMessages}
            actionLoading={actions.actionLoading}
            onDelete={actions.deleteMessage}
          />
        )}
        {activeTab === 'sessions' && (
          <SessionManagement
            sessions={data.sessions}
            loading={data.loadingSessions}
            language={language}
            onVerify={actions.verifySessionPhotos}
            onUnverify={actions.unverifySessionPhotos}
          />
        )}
        {activeTab === 'revenue' && <AdminRevenueTab language={language} />}
      </div>

      <ConfirmDialog
        open={!!actions.confirmAction}
        title={actions.confirmAction?.title ?? ''}
        message={actions.confirmAction?.message ?? ''}
        confirmLabel={actions.confirmAction?.confirmLabel ?? t('confirmAction')}
        cancelLabel={t('cancel')}
        variant={actions.confirmAction?.variant ?? 'default'}
        onConfirm={() => actions.confirmAction?.onConfirm()}
        onCancel={() => actions.setConfirmAction(null)}
      />
    </div>
  );
}
