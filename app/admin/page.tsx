/** Page: /admin — Admin dashboard for managing users, sessions, reports, and feedback */
'use client';
import { useLanguage } from '@/lib/LanguageContext';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';
import {
  AdminStats,
  UserManagement,
  ReportedMessages,
  FeedbackList,
  BugReports,
  MessageList,
  SessionManagement,
} from '@/components/admin';
import type { User as AuthUser } from '@supabase/supabase-js';

import { useAdminData } from './useAdminData';
import { useAdminActions } from './useAdminActions';

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  const data = useAdminData(supabase);
  const actions = useAdminActions(supabase, user?.id, language, {
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
        alert('Unauthorized access');
        router.push('/');
        return;
      }
      setUser(user);
      setAuthorized(true);
      await data.loadStats();
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
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  if (!authorized) return null;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'users', label: 'Users' },
    { id: 'reports', label: 'Reports', badge: pendingReports.length, badgeColor: 'bg-red-500' },
    { id: 'feedback', label: 'Feedback', badge: pendingFeedback.length, badgeColor: 'bg-blue-500' },
    { id: 'bugs', label: 'Bugs', badge: pendingBugs.length, badgeColor: 'bg-orange-500' },
    { id: 'messages', label: 'Messages' },
    { id: 'sessions', label: 'Sessions' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 pb-32 safe-area-top">
      <div className="w-full max-w-md mx-auto px-3 py-4">
        <Link href="/settings" className="inline-flex items-center gap-1 text-stone-600 mb-3 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="text-lg font-bold text-[#272D34] mb-1">Admin Panel</h1>
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
                activeTab === tab.id ? 'border-b-2 border-[#C0E863] text-[#272D34]' : 'text-stone-600'
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

        {activeTab === 'dashboard' && <AdminStats stats={data.stats} />}
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
      </div>
    </div>
  );
}
