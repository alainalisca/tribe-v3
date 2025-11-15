'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, LogOut, Shield } from 'lucide-react';
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
