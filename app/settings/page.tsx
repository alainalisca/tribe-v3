/** Page: /settings — App settings: notifications, theme, language, account */
'use client';

import Link from 'next/link';
import { ArrowLeft, Globe, LogOut, Shield, Trash2, MessageSquare, Bug } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useSettings } from './useSettings';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const router = useRouter();
  const {
    txt,
    userIsAdmin,
    showDeleteConfirm,
    deleteInput,
    setDeleteInput,
    notificationsEnabled,
    sessionRemindersEnabled,
    loadingReminders,
    handleSignOut,
    handleDeleteAccount,
    toggleSessionReminders,
    toggleNotifications,
    openDeleteConfirm,
    closeDeleteConfirm,
  } = useSettings(language);

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/profile">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{txt.settings}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {/* Admin Section - Only for admin */}
        {userIsAdmin && (
          <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-tribe-green" />
              <h2 className="text-lg font-bold text-theme-primary">{txt.admin}</h2>
            </div>
            <Link href="/admin">
              <button className="w-full p-4 rounded-xl text-left bg-tribe-green text-slate-900 hover:bg-[#b0d853] transition font-semibold">
                {txt.adminPanel}
              </button>
            </Link>
          </div>
        )}

        {/* Help & Feedback Section */}
        <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="w-5 h-5 text-tribe-green" />
            <h2 className="text-lg font-bold text-theme-primary">{txt.help}</h2>
          </div>
          <div className="space-y-2">
            <Link href="/feedback">
              <Button
                variant="ghost"
                className="w-full p-4 rounded-xl text-left justify-start text-stone-700 dark:text-gray-300 bg-stone-100 dark:bg-[#3D4349] hover:bg-stone-200 dark:hover:bg-[#52575D] flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                {txt.feedback}
              </Button>
            </Link>
            <Link href="/feedback">
              <Button
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  router.push('/feedback?tab=bug');
                }}
                className="w-full p-4 rounded-xl text-left justify-start text-stone-700 dark:text-gray-300 bg-stone-100 dark:bg-[#3D4349] hover:bg-stone-200 dark:hover:bg-[#52575D] flex items-center gap-2"
              >
                <Bug className="w-4 h-4" />
                {txt.bugReport}
              </Button>
            </Link>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-5 h-5 text-tribe-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <h2 className="text-lg font-bold text-theme-primary">{txt.pushNotifications}</h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={toggleNotifications}
              className={`w-full p-4 rounded-xl text-left transition font-semibold ${
                notificationsEnabled
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {notificationsEnabled ? txt.notificationsEnabledLabel : txt.enableNotifications}
            </button>

            {/* Session Reminders Toggle */}
            <button
              onClick={toggleSessionReminders}
              disabled={loadingReminders || !notificationsEnabled}
              className={`w-full p-4 rounded-xl text-left transition font-semibold ${
                !notificationsEnabled
                  ? 'bg-stone-50 dark:bg-[#272D34] text-stone-400 dark:text-gray-500 cursor-not-allowed'
                  : sessionRemindersEnabled
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {sessionRemindersEnabled ? txt.sessionRemindersOn : txt.sessionRemindersOff}
                  </div>
                  <div
                    className={`text-xs mt-1 ${!notificationsEnabled ? 'text-stone-400' : sessionRemindersEnabled ? 'text-slate-700' : 'text-stone-500'}`}
                  >
                    {txt.sessionRemindersDesc}
                  </div>
                </div>
                {loadingReminders && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Language Section */}
        <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-tribe-green" />
            <h2 className="text-lg font-bold text-theme-primary">{txt.language}</h2>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setLanguage('en')}
              className={`w-full p-4 rounded-xl text-left transition ${
                language === 'en'
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {txt.english}
            </button>
            <button
              onClick={() => setLanguage('es')}
              className={`w-full p-4 rounded-xl text-left transition ${
                language === 'es'
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {txt.spanish}
            </button>
          </div>
        </div>

        {/* Legal Section */}
        <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-theme-primary mb-4">{txt.legal}</h2>
          <div className="space-y-2">
            <Link href="/legal/terms">
              <Button
                variant="ghost"
                className="w-full p-4 rounded-xl text-left justify-start text-stone-700 dark:text-gray-300 bg-stone-100 dark:bg-[#3D4349] hover:bg-stone-200 dark:hover:bg-[#52575D]"
              >
                {txt.terms}
              </Button>
            </Link>
            <Link href="/legal/privacy">
              <Button
                variant="ghost"
                className="w-full p-4 rounded-xl text-left justify-start text-stone-700 dark:text-gray-300 bg-stone-100 dark:bg-[#3D4349] hover:bg-stone-200 dark:hover:bg-[#52575D]"
              >
                {txt.privacy}
              </Button>
            </Link>
            <Link href="/legal/safety">
              <Button
                variant="ghost"
                className="w-full p-4 rounded-xl text-left justify-start text-stone-700 dark:text-gray-300 bg-stone-100 dark:bg-[#3D4349] hover:bg-stone-200 dark:hover:bg-[#52575D]"
              >
                {txt.safety}
              </Button>
            </Link>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-theme-primary mb-4">{txt.account}</h2>
          <Button
            variant="destructive"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl"
          >
            <LogOut className="w-5 h-5" />
            {txt.signOut}
          </Button>
          <Button
            variant="ghost"
            onClick={openDeleteConfirm}
            className="w-full flex items-center justify-center gap-2 py-3 mt-3 bg-stone-200 dark:bg-[#3D4349] text-red-600 font-semibold rounded-xl hover:bg-stone-300 dark:hover:bg-[#52575D]"
          >
            <Trash2 className="w-5 h-5" />
            {txt.deleteAccount}
          </Button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => !open && closeDeleteConfirm()}>
        <DialogContent data-modal="true" className="max-w-sm rounded-xl p-6 dark:bg-[#404549]">
          <DialogTitle className="text-lg font-bold text-red-600">{txt.deleteModalTitle}</DialogTitle>
          <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{txt.deleteModalDesc}</p>
          <input
            type="text"
            value={deleteInput}
            onChange={(e) => setDeleteInput(e.target.value)}
            placeholder={txt.deleteConfirmWord}
            className="w-full px-4 py-2 border border-stone-300 dark:border-[#52575D] rounded-lg mb-4 bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
            autoComplete="off"
          />
          <div className="flex gap-3">
            <button
              onClick={closeDeleteConfirm}
              className="flex-1 py-2.5 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-[#52575D] font-medium"
            >
              {txt.cancel}
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteInput !== txt.deleteConfirmWord}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {txt.delete}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
