'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, LogOut, Shield, MessageSquare, Bug } from 'lucide-react';
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

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  async function toggleNotifications() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationsEnabled(false);
      alert(language === 'en' ? 'Notifications disabled' : 'Notificaciones desactivadas');
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
      alert(language === 'en' 
        ? 'Notifications are blocked. Please enable them in your browser settings.' 
        : 'Las notificaciones están bloqueadas. Por favor actívalas en la configuración de tu navegador.');
    }
  }

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  const txt = language === 'en' ? {
    settings: 'Settings',
    language: 'Language',
    english: 'English',
    spanish: 'Spanish',
    account: 'Account',
    signOut: 'Sign Out',
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
    <div className="min-h-screen bg-theme-page pb-20">
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
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-theme-primary hover:bg-stone-200 transition flex items-center gap-2">
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
                className="w-full p-4 rounded-xl text-left bg-stone-100 text-theme-primary hover:bg-stone-200 transition flex items-center gap-2"
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
          <button
            onClick={toggleNotifications}
            className={`w-full p-4 rounded-xl text-left transition font-semibold ${
              notificationsEnabled
                ? 'bg-tribe-green text-slate-900'
                : 'bg-stone-100 text-theme-primary hover:bg-stone-200'
            }`}
          >
            {notificationsEnabled 
              ? (language === 'en' ? '✓ Notifications Enabled' : '✓ Notificaciones Activadas')
              : (language === 'en' ? 'Enable Notifications' : 'Activar Notificaciones')}
          </button>
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
                  : 'bg-stone-100 text-theme-primary hover:bg-stone-200'
              }`}
            >
              {txt.english}
            </button>
            <button
              onClick={() => setLanguage('es')}
              className={`w-full p-4 rounded-xl text-left transition ${
                language === 'es'
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 text-theme-primary hover:bg-stone-200'
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
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-theme-primary hover:bg-stone-200 transition">
                {txt.terms}
              </button>
            </Link>
            <Link href="/legal/privacy">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-theme-primary hover:bg-stone-200 transition">
                {txt.privacy}
              </button>
            </Link>
            <Link href="/legal/safety">
              <button className="w-full p-4 rounded-xl text-left bg-stone-100 text-theme-primary hover:bg-stone-200 transition">
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
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
