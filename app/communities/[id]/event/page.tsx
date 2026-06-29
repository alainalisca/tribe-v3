'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { createCommunityEvent } from '@/lib/dal/communityEvents';
import { isCommunityMember } from '@/lib/dal/communities';
import { ChevronLeft, CalendarPlus, Loader2 } from 'lucide-react';

const getT = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Nuevo Evento' : 'New Event',
  eventTitle: language === 'es' ? 'Titulo del evento' : 'Event title',
  description: language === 'es' ? 'Descripcion (opcional)' : 'Description (optional)',
  location: language === 'es' ? 'Lugar (opcional)' : 'Location (optional)',
  startDate: language === 'es' ? 'Fecha y hora de inicio' : 'Start date & time',
  endDate: language === 'es' ? 'Fecha y hora de fin (opcional)' : 'End date & time (optional)',
  create: language === 'es' ? 'Crear evento' : 'Create event',
  creating: language === 'es' ? 'Creando...' : 'Creating...',
  cancel: language === 'es' ? 'Cancelar' : 'Cancel',
  required: language === 'es' ? 'El titulo y la fecha son requeridos' : 'Title and start date are required',
  success: language === 'es' ? 'Evento creado' : 'Event created',
  error: language === 'es' ? 'No se pudo crear el evento' : 'Failed to create event',
  membersOnly: language === 'es' ? 'Debes ser miembro para crear eventos' : 'You must be a member to create events',
});

export default function NewCommunityEventPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getT(language);

  const communityId = params?.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventAt, setEventAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      setUserId(user.id);

      const memberCheck = await isCommunityMember(supabase, communityId, user.id);
      if (!memberCheck.success || !memberCheck.data) {
        showError(t.membersOnly);
        router.push(`/communities/${communityId}`);
      }
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !eventAt) {
      showError(t.required);
      return;
    }
    if (!userId) return;

    setLoading(true);
    try {
      const result = await createCommunityEvent(supabase, {
        community_id: communityId,
        created_by: userId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        event_at: new Date(eventAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      });

      if (!result.success) {
        await haptic('error');
        showError(result.error || t.error);
        return;
      }

      await haptic('success');
      showSuccess(t.success);
      router.push(`/communities/${communityId}`);
    } catch (err) {
      logError(err, { action: 'createCommunityEvent' });
      await haptic('error');
      showError(t.error);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2.5 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent text-sm';

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
      {/* Header */}
      <div className="sticky top-0 safe-area-top bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push(`/communities/${communityId}`)}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
            aria-label={t.cancel}
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-lg font-bold text-theme-primary">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              required
              placeholder={t.eventTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              maxLength={120}
            />
          </div>

          <div>
            <textarea
              placeholder={t.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputCls}
            />
          </div>

          <div>
            <input
              placeholder={t.location}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputCls}
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1">{t.startDate}</label>
            <input
              required
              type="datetime-local"
              value={eventAt}
              onChange={(e) => setEventAt(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-theme-secondary mb-1">{t.endDate}</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              min={eventAt}
              className={inputCls}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push(`/communities/${communityId}`)}
              className="flex-1 px-6 py-3 border-2 border-stone-300 dark:border-tribe-card rounded-lg font-semibold text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !eventAt}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-tribe-green transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CalendarPlus className="w-5 h-5" />}
              {loading ? t.creating : t.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
