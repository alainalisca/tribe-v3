'use client';

/**
 * Dashboard CTA: "Record group attendance" with a session-picker modal.
 *
 * Clicking the button opens a modal listing the instructor's 10 most
 * recent sessions; each row is a Link to /os/sessions/[id]/attendance
 * where the bulk-attendance roster lives.
 *
 * Why a modal instead of a top-level dropdown: the dashboard already
 * carries a stack of widgets; a click-to-open modal keeps the resting
 * surface small while still giving one-click access to the bulk flow.
 *
 * Session list is fetched lazily — only on first open of the modal —
 * so we don't slow down the dashboard's first paint for users who
 * don't engage with this CTA.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';

interface SessionOption {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    cta: 'Record group attendance',
    modalTitle: 'Pick a session',
    modalHint: 'Tap a recent session to mark who attended and what they paid.',
    loading: 'Loading',
    empty: "You haven't created any sessions yet. Create one to record attendance.",
    createCta: 'Create a session',
  },
  es: {
    cta: 'Registrar asistencia grupal',
    modalTitle: 'Elige una sesión',
    modalHint: 'Toca una sesión reciente para registrar quién asistió y cuánto pagó.',
    loading: 'Cargando',
    empty: 'Aún no has creado sesiones. Crea una para registrar asistencia.',
    createCta: 'Crear sesión',
  },
} as const;

export default function RecordGroupAttendanceButton() {
  const { language } = useLanguage();
  const s = copy[language];

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionOption[] | null>(null);

  // Fetch on first open. Sessions are world-readable, so we scope
  // explicitly by creator_id (otherwise the dropdown would show any
  // random session on the platform).
  useEffect(() => {
    if (!open || sessions !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setSessions([]);
          return;
        }
        const { data, error } = await supabase
          .from('sessions')
          .select('id, title, sport, date')
          .eq('creator_id', user.id)
          .order('date', { ascending: false })
          .limit(10);
        if (cancelled) return;
        if (error || !data) {
          setSessions([]);
          return;
        }
        setSessions(
          data.map((row) => ({
            id: row.id as string,
            title: (row.title as string | null) ?? null,
            sport: (row.sport as string | null) ?? null,
            date: (row.date as string) ?? '',
          }))
        );
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessions]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackEvent('tribe_os_bulk_attendance_picker_opened');
        }}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-tribe-surface text-white text-xs font-semibold rounded-full border border-tribe-mid hover:bg-tribe-mid transition-colors"
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        {s.cta}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-5 bg-tribe-surface border border-tribe-mid text-white">
          <DialogTitle className="text-base font-bold text-white mb-1">{s.modalTitle}</DialogTitle>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">{s.modalHint}</p>

          {sessions === null ? (
            <div className="py-6 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 bg-tribe-mid/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-white/70 leading-relaxed">{s.empty}</p>
              <Link
                href="/create"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full"
              >
                {s.createCta}
              </Link>
            </div>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {sessions.map((opt) => (
                <li key={opt.id}>
                  <Link
                    href={`/os/sessions/${opt.id}/attendance`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-tribe-mid bg-tribe-dark/40 hover:border-tribe-green/40 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-tribe-green shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{opt.title || opt.sport || 'Session'}</p>
                      <p className="text-[11px] text-white/60 mt-0.5">{opt.date}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
