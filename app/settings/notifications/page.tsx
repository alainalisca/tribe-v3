'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/dal/notificationPreferences';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

type Prefs = Omit<NotificationPreferences, 'user_id'>;

export default function NotificationPreferencesPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const supabase = createClient();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth');
        return;
      }
      const res = await getNotificationPreferences(supabase, user.id);
      if (cancelled) return;
      if (res.success && res.data) {
        const { user_id: _drop, ...rest } = res.data;
        setPrefs(rest);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  const t = {
    title: language === 'es' ? 'Preferencias de Notificaciones' : 'Notification Preferences',
    save: language === 'es' ? 'Guardar' : 'Save',
    saved: language === 'es' ? 'Preferencias guardadas' : 'Preferences saved',
    error: language === 'es' ? 'No se pudo guardar' : 'Could not save',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    categories: [
      {
        key: 'session_reminders' as keyof Prefs,
        title: language === 'es' ? 'Recordatorios de Sesión' : 'Session Reminders',
        desc: language === 'es' ? '1 hora y 15 min antes' : '1 hour and 15 min before',
      },
      {
        key: 'session_updates' as keyof Prefs,
        title: language === 'es' ? 'Actualizaciones de Sesión' : 'Session Updates',
        desc: language === 'es' ? 'Cambios, cancelaciones, lista de espera' : 'Changes, cancellations, waitlist',
      },
      {
        key: 'social_activity' as keyof Prefs,
        title: language === 'es' ? 'Actividad Social' : 'Social Activity',
        desc: language === 'es' ? 'Seguidores, me gusta, comentarios' : 'Follows, likes, comments',
      },
      {
        key: 'messages' as keyof Prefs,
        title: language === 'es' ? 'Mensajes' : 'Messages',
        desc: language === 'es' ? 'Mensajes directos, chat de sesión' : 'Direct messages, session chat',
      },
      {
        key: 'training_nudges' as keyof Prefs,
        title: language === 'es' ? 'Recordatorios de Entrenamiento' : 'Training Nudges',
        desc: language === 'es' ? 'Rachas, hábitos, regresos' : 'Streaks, habits, comeback',
      },
      {
        key: 'instructor_updates' as keyof Prefs,
        title: language === 'es' ? 'Actualizaciones de Instructores' : 'Instructor Updates',
        desc: language === 'es' ? 'Nuevas publicaciones y sesiones' : 'New posts and sessions',
      },
      {
        key: 'challenges' as keyof Prefs,
        title: language === 'es' ? 'Desafíos' : 'Challenges',
        desc: language === 'es' ? 'Progreso y nuevos desafíos' : 'Progress and new challenges',
      },
      {
        key: 'marketing' as keyof Prefs,
        title: language === 'es' ? 'Marketing y Promociones' : 'Marketing & Promotions',
        desc: language === 'es' ? 'Destacados, ofertas especiales' : 'Spotlight, special offers',
      },
      {
        key: 'weekly_recap' as keyof Prefs,
        title: language === 'es' ? 'Resumen Semanal' : 'Weekly Recap',
        desc: language === 'es' ? 'Resumen de entrenamiento cada domingo' : 'Training summary every Sunday',
      },
    ],
    delivery: language === 'es' ? 'Método de Entrega' : 'Delivery Method',
    push: language === 'es' ? 'Notificaciones Push' : 'Push Notifications',
    email: language === 'es' ? 'Notificaciones Email' : 'Email Notifications',
  };

  const toggle = (key: keyof Prefs) => {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: !prefs[key] });
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const res = await updateNotificationPreferences(supabase, user.id, prefs);
    if (res.success) {
      await haptic('success');
      showSuccess(t.saved);
    } else {
      showError(res.error || t.error);
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen pb-24 bg-[#272D34] text-white">
      <div className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#A3E635]" />
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
        </div>

        {loading || !prefs ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.loading}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {t.categories.map((cat) => (
                <li key={cat.key} className="bg-[#3D4349] rounded-xl p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{cat.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{cat.desc}</p>
                  </div>
                  <Toggle checked={!!prefs[cat.key]} onChange={() => toggle(cat.key)} />
                </li>
              ))}
            </ul>

            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide pt-2">{t.delivery}</h2>
            <ul className="space-y-2">
              <li className="bg-[#3D4349] rounded-xl p-4 flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold">{t.push}</span>
                <Toggle checked={prefs.push_enabled} onChange={() => toggle('push_enabled')} />
              </li>
              <li className="bg-[#3D4349] rounded-xl p-4 flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold">{t.email}</span>
                <Toggle checked={prefs.email_enabled} onChange={() => toggle('email_enabled')} />
              </li>
            </ul>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
            >
              {saving ? '…' : t.save}
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-[#84cc16]' : 'bg-[#272D34]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
