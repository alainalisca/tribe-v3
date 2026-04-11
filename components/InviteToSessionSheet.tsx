'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, MapPin, Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { fetchUpcomingSessionsByUser } from '@/lib/dal/sessions';
import { sportTranslations } from '@/lib/translations';
import { showSuccess, showError } from '@/lib/toast';
import type { TrainingPartner } from '@/lib/dal/connections';

interface InviteToSessionSheetProps {
  open: boolean;
  onClose: () => void;
  athlete: TrainingPartner;
  language: string;
}

type UpcomingSession = {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
};

export default function InviteToSessionSheet({ open, onClose, athlete, language }: InviteToSessionSheetProps) {
  const supabase = createClient();
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const isEs = language === 'es';

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const result = await fetchUpcomingSessionsByUser(supabase, user.id, 10);
      if (result.success && result.data) {
        setSessions(result.data);
      }
      setLoading(false);
    };

    load();
  }, [open, supabase]);

  const handleInvite = async (sessionId: string) => {
    if (!userId) return;
    setSendingId(sessionId);

    try {
      const res = await fetch('/api/invites/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          recipient_user_id: athlete.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showError(data.error || (isEs ? 'Error al invitar' : 'Failed to invite'));
      } else {
        showSuccess(isEs ? 'Invitacion enviada' : 'Invite sent');
        onClose();
      }
    } catch {
      showError(isEs ? 'Error de red' : 'Network error');
    } finally {
      setSendingId(null);
    }
  };

  const initials = athlete.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="bg-[#272D34] border-[#3D4349] text-white max-w-md mx-auto rounded-t-2xl sm:rounded-2xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">{isEs ? 'Invitar a sesion' : 'Invite to session'}</DialogTitle>

        {/* Athlete header */}
        <div className="flex items-center gap-3 p-5 border-b border-[#3D4349]">
          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-[#A3E635] to-[#8fd61d] flex-shrink-0">
            {athlete.avatar_url ? (
              <Image src={athlete.avatar_url} alt={athlete.name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-stone-700">
                {initials}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white">{athlete.name}</h3>
            <p className="text-sm text-gray-400">{isEs ? 'Invitar a una sesion' : 'Invite to a session'}</p>
          </div>
        </div>

        {/* Sessions list */}
        <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
          <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            {isEs ? 'Tus proximas sesiones' : 'Your upcoming sessions'}
          </h4>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#A3E635]" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-2">
                {isEs ? 'No tienes sesiones proximas' : 'No upcoming sessions'}
              </p>
              <p className="text-xs text-gray-500">{isEs ? 'Crea una sesion primero' : 'Create a session first'}</p>
            </div>
          ) : (
            sessions.map((session) => {
              const sportLabel = sportTranslations[session.sport]?.[language as 'en' | 'es'] || session.sport;
              const isSending = sendingId === session.id;

              return (
                <div key={session.id} className="flex items-center justify-between bg-[#3D4349] rounded-lg p-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <span className="inline-block bg-[#A3E635] text-stone-900 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {sportLabel}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-gray-300">
                      <CalendarDays className="w-3 h-3" />
                      <span>
                        {session.date} {session.start_time}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{session.location}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleInvite(session.id)}
                    disabled={isSending}
                    className="ml-3 px-3 py-1.5 bg-[#A3E635] text-stone-900 text-xs font-semibold rounded-full hover:bg-[#8fd61d] transition disabled:opacity-50 flex-shrink-0"
                  >
                    {isSending ? <Loader2 className="w-3 h-3 animate-spin" /> : isEs ? 'Invitar' : 'Invite'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Create new session CTA */}
        <div className="p-5 pt-0">
          <Link
            href="/create"
            className="flex items-center justify-center gap-2 w-full py-3 border border-[#A3E635] text-[#A3E635] rounded-lg font-semibold text-sm hover:bg-[#A3E635]/10 transition"
            onClick={onClose}
          >
            <Plus className="w-4 h-4" />
            {isEs ? 'Crear nueva sesion' : 'Create new session'}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
