'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, LogOut, Shield, Trash2, MessageSquare, Bug } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language, setLanguage } = useLanguage();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  async function handleDeleteAccount() {
    const confirmWord = language === 'es' ? 'ELIMINAR' : 'DELETE';
    const input = prompt(language === 'es' 
      ? '¿Estás seguro? Esto eliminará permanentemente tu cuenta y todos los datos. Escribe ELIMINAR para confirmar.'
      : 'Are you sure? This will permanently delete your account and all data. Type DELETE to confirm.');
    if (input !== confirmWord) {
      showInfo(language === 'es' ? 'Eliminación cancelada' : 'Deletion cancelled');
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);

      if (deleteError) throw deleteError;

      await supabase.auth.signOut();
      showSuccess(language === 'es' ? 'Cuenta eliminada' : 'Account deleted');
      router.push('/');
    } catch (error: any) {
      showError(error.message);
    }
  }

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sessionRemindersEnabled, setSessionRemindersEnabled] = useState(true);
  const [loadingReminders, setLoadingReminders] = useState(false);

  async function toggleSessionReminders() {
    if (!user) return;
    setLoadingReminders(true);
    try {
      const newValue = !sessionRemindersEnabled;
      const { error } = await supabase
        .from('users')
        .update({ session_reminders_enabled: newValue })
        .eq('id', user.id);

      if (error) throw error;

      setSessionRemindersEnabled(newValue);
      showSuccess(
        newValue
          ? (language === 'es' ? 'Recordatorios activados' : 'Reminders enabled')
          : (language === 'es' ? 'Recordatorios desactivados' : 'Reminders disabled')
      );
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoadingReminders(false);
    }
  }

  async function toggleNotifications() {
    if (!('Notification' in window)) {
      showError('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(false);
      showInfo(language === 'en' ? 'Notifications disabled' : 'Notificaciones desactivadas');
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        new Notification('Tribe', {
          body: language === 'en' 
            ? 'Notifications enabled! You\'ll receive updates about your sessions.' 
            : '¡Notificaciones activadas! Recibirás actualizaciones sobre tus sesiones.',
          icon: '/icon-192x192.png'
        });
      }
    } else {
      showError(language === 'en' 
        ? 'Notifications are blocked. Please enable them in your browser settings.' 
        : 'Las notificaciones están bloqueadas. Por favor actívalas en la configuración de tu navegador.');
    }
  }

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  // Load user's reminder preference
  useEffect(() => {
    async function loadReminderPreference() {
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('session_reminders_enabled')
        .eq('id', user.id)
        .single();

      if (data) {
        setSessionRemindersEnabled(data.session_reminders_enabled !== false);
      }
    }
    loadReminderPreference();
  }, [user]);


  const txt = language === 'en' ? {
    settings: 'Settings',
    language: 'Language',
    english: 'English',
    spanish: 'Spanish',
    account: 'Account',
    signOut: 'Sign Out',
    deleteAccount: 'Delete Account',
    deleteAccountConfirm: 'Are you sure? This will permanently delete your account and all data. Type DELETE to confirm.',
    legal: 'Legal',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    safety: 'Safety Guidelines',
    admin: 'Admin',
    adminPanel: 'Admin Panel',
    help: 'Help & Feedback',
    feedback: 'Send Feedback',
    bugReport: 'Report a Bug',
  } : {
    settings: 'Configuración',
    language: 'Idioma',
    english: 'Inglés',
    spanish: 'Español',
    account: 'Cuenta',
    signOut: 'Cerrar Sesión',
    deleteAccount: 'Eliminar Cuenta',
    deleteAccountConfirm: '¿Estás seguro? Esto eliminará permanentemente tu cuenta y todos los datos. Escribe ELIMINAR para confirmar.',
    legal: 'Legal',
    terms: 'Términos de Servicio',
    privacy: 'Política de Privacidad',
    safety: 'Guías de Seguridad',
    admin: 'Administrador',
    adminPanel: 'Panel de Administrador',
    help: 'Ayuda y Comentarios',
    feedback: 'Enviar Comentarios',
    bugReport: 'Reportar un Error',
  };

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href="/profile">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{txt.settings}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Admin Section - Only for admin */}
        {user?.email === 'alainalisca@aplusfitnessllc.com' && (
          <div className="bg-white rounded-2xl p-5 border border-stone-200">
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
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="w-5 h-5 text-tribe-green" />
            <h2 className="text-lg font-bold text-theme-primary">{txt.help}</h2>
          </div>
          <div className="space-y-2">
            <Link href="/feedback">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-stone-700 hover:bg-stone-200 transition flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                {txt.feedback}
              </button>
            </Link>
            <Link href="/feedback">
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  router.push('/feedback?tab=bug');
                }}
                className="w-full p-4 rounded-xl text-left bg-stone-100 text-stone-700 hover:bg-stone-200 transition flex items-center gap-2"
              >
                <Bug className="w-4 h-4" />
                {txt.bugReport}
              </button>
            </Link>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-5 h-5 text-tribe-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <h2 className="text-lg font-bold text-theme-primary">
              {language === 'en' ? 'Push Notifications' : 'Notificaciones Push'}
            </h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={toggleNotifications}
              className={`w-full p-4 rounded-xl text-left transition font-semibold ${
                notificationsEnabled
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {notificationsEnabled
                ? (language === 'en' ? '✓ Notifications Enabled' : '✓ Notificaciones Activadas')
                : (language === 'en' ? 'Enable Notifications' : 'Activar Notificaciones')}
            </button>

            {/* Session Reminders Toggle */}
            <button
              onClick={toggleSessionReminders}
              disabled={loadingReminders || !notificationsEnabled}
              className={`w-full p-4 rounded-xl text-left transition font-semibold ${
                !notificationsEnabled
                  ? 'bg-stone-50 text-stone-400 cursor-not-allowed'
                  : sessionRemindersEnabled
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {sessionRemindersEnabled
                      ? (language === 'en' ? '✓ Session Reminders' : '✓ Recordatorios de Sesión')
                      : (language === 'en' ? 'Session Reminders' : 'Recordatorios de Sesión')}
                  </div>
                  <div className={`text-xs mt-1 ${!notificationsEnabled ? 'text-stone-400' : sessionRemindersEnabled ? 'text-slate-700' : 'text-stone-500'}`}>
                    {language === 'en'
                      ? '1 hour & 15 min before your sessions'
                      : '1 hora y 15 min antes de tus sesiones'}
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
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
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
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {txt.english}
            </button>
            <button
              onClick={() => setLanguage('es')}
              className={`w-full p-4 rounded-xl text-left transition ${
                language === 'es'
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {txt.spanish}
            </button>
          </div>
        </div>

        {/* Legal Section */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <h2 className="text-lg font-bold text-theme-primary mb-4">{txt.legal}</h2>
          <div className="space-y-2">
            <Link href="/legal/terms">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-stone-700 hover:bg-stone-200 transition">
                {txt.terms}
              </button>
            </Link>
            <Link href="/legal/privacy">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-stone-700 hover:bg-stone-200 transition">
                {txt.privacy}
              </button>
            </Link>
            <Link href="/legal/safety">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-stone-700 hover:bg-stone-200 transition">
                {txt.safety}
              </button>
            </Link>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-white rounded-2xl p-5 border border-stone-200">
          <h2 className="text-lg font-bold text-theme-primary mb-4">{txt.account}</h2>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition"
          >
            <LogOut className="w-5 h-5" />
            {txt.signOut}
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full flex items-center justify-center gap-2 py-3 mt-3 bg-stone-200 text-red-600 font-semibold rounded-xl hover:bg-stone-300 transition"
          >
            <Trash2 className="w-5 h-5" />
            {txt.deleteAccount}
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
