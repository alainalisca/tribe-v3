'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { listCommunityEvents, rsvpToEvent, cancelRsvp, type CommunityEventWithRsvp } from '@/lib/dal/communityEvents';
import { SkeletonCard } from '@/components/Skeleton';
import { CalendarPlus, CalendarDays, MapPin, Users, Loader2, CheckCircle2, Plus } from 'lucide-react';

// ─── i18n ────────────────────────────────────────────────────────────────────

const getT = (lang: 'en' | 'es') => ({
  newEvent: lang === 'es' ? 'Nuevo Evento' : 'New Event',
  noEvents: lang === 'es' ? 'Sin eventos proximos' : 'No upcoming events',
  noEventsDesc: lang === 'es' ? 'Crea el primer evento de la comunidad' : 'Create the first event for this community',
  rsvp: lang === 'es' ? 'Asistire' : "I'll attend",
  cancelRsvp: lang === 'es' ? 'Cancelar RSVP' : 'Cancel RSVP',
  rsvpd: lang === 'es' ? 'Confirmado' : 'Going',
  rsvpSuccess: lang === 'es' ? 'Confirmada tu asistencia' : 'RSVP confirmed',
  rsvpCancelled: lang === 'es' ? 'RSVP cancelado' : 'RSVP cancelled',
  rsvpError: lang === 'es' ? 'No se pudo confirmar' : 'Could not confirm',
  athletes: lang === 'es' ? 'atletas' : 'athletes',
  loadError: lang === 'es' ? 'No se pudo cargar eventos' : 'Could not load events',
  ends: lang === 'es' ? 'Termina' : 'Ends',
});

function formatEventDate(isoString: string, lang: 'en' | 'es'): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── EventCard ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: CommunityEventWithRsvp;
  userId: string | null;
  onRsvpToggle: (eventId: string, currentlyRsvpd: boolean) => Promise<void>;
  toggling: boolean;
}

function EventCard({ event, userId, onRsvpToggle, toggling }: EventCardProps) {
  const { language } = useLanguage();
  const t = getT(language);

  return (
    <div className="bg-white dark:bg-tribe-mid rounded-xl border border-stone-200 dark:border-tribe-card p-4 space-y-3">
      {/* Title */}
      <h3 className="font-semibold text-theme-primary text-base leading-snug">{event.title}</h3>

      {/* Description */}
      {event.description && (
        <p className="text-sm text-stone-600 dark:text-gray-400 leading-relaxed">{event.description}</p>
      )}

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          {formatEventDate(event.event_at, language)}
        </span>
        {event.ends_at && (
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {t.ends}: {formatEventDate(event.ends_at, language)}
          </span>
        )}
        {event.location && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {event.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 shrink-0" />
          {event.rsvp_count} {t.athletes}
        </span>
      </div>

      {/* RSVP button */}
      {userId && (
        <button
          onClick={() => onRsvpToggle(event.id, event.user_rsvpd)}
          disabled={toggling}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-60 ${
            event.user_rsvpd
              ? 'border-2 border-tribe-green text-tribe-green hover:bg-tribe-green/10'
              : 'bg-tribe-green text-slate-900 hover:opacity-90'
          }`}
        >
          {toggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : event.user_rsvpd ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <CalendarPlus className="w-4 h-4" />
          )}
          {event.user_rsvpd ? t.rsvpd : t.rsvp}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CommunityEventsTabProps {
  communityId: string;
  isMember: boolean;
  userId: string | null;
}

export default function CommunityEventsTab({ communityId, isMember, userId }: CommunityEventsTabProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getT(language);

  const [events, setEvents] = useState<CommunityEventWithRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  // Track which event is being toggled to show per-card spinner
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listCommunityEvents(supabase, communityId, userId);
      if (result.success) {
        setEvents(result.data ?? []);
      } else {
        showError(result.error || t.loadError);
      }
    } catch (err) {
      logError(err, { action: 'loadCommunityEvents' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, userId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  async function handleRsvpToggle(eventId: string, currentlyRsvpd: boolean) {
    if (!userId) return;
    setTogglingId(eventId);
    try {
      const result = currentlyRsvpd
        ? await cancelRsvp(supabase, eventId, userId)
        : await rsvpToEvent(supabase, eventId, userId);

      if (!result.success) {
        await haptic('error');
        showError(result.error || t.rsvpError);
        return;
      }

      await haptic('success');
      showSuccess(currentlyRsvpd ? t.rsvpCancelled : t.rsvpSuccess);

      // Optimistic local update — avoids visible flicker
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                user_rsvpd: !currentlyRsvpd,
                rsvp_count: currentlyRsvpd ? ev.rsvp_count - 1 : ev.rsvp_count + 1,
              }
            : ev
        )
      );

      // Silent reconcile: re-fetch from server so the optimistic count can't
      // drift (e.g. after the idempotent 23505 path where no row was inserted).
      // Done without setLoading so there is no spinner flash.
      void listCommunityEvents(supabase, communityId, userId).then((r) => {
        if (r.success) setEvents(r.data ?? []);
      });
    } catch (err) {
      logError(err, { action: 'handleRsvpToggle' });
      await haptic('error');
      showError(t.rsvpError);
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-40">
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create event CTA — visible to members */}
      {isMember && (
        <Link
          href={`/communities/${communityId}/event`}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-tribe-green text-slate-900 rounded-lg hover:bg-tribe-green font-semibold transition shadow-sm"
        >
          <Plus className="w-5 h-5" />
          {t.newEvent}
        </Link>
      )}

      {events.length === 0 ? (
        <div className="text-center py-12">
          <CalendarDays className="w-12 h-12 mx-auto text-stone-400 dark:text-gray-500 mb-3" />
          <p className="text-theme-primary font-medium">{t.noEvents}</p>
          {isMember && <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.noEventsDesc}</p>}
        </div>
      ) : (
        events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            userId={userId}
            onRsvpToggle={handleRsvpToggle}
            toggling={togglingId === event.id}
          />
        ))
      )}
    </div>
  );
}
