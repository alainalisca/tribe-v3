'use client';

import { useRef, useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { addSessionGuest, removeSessionGuest } from '@/lib/dal';
import { sessionHasEnded } from '@/components/AttendanceTracker';

interface DoorCheckInCardProps {
  sessionId: string;
  isCreator: boolean;
  isAdmin: boolean;
  sessionDate: string;
  sessionStartTime: string;
  sessionEndTime: string | null;
  sessionStatus: string | null;
  language: 'en' | 'es';
  /** Refresh the session so the participant count and roster reflect the change. */
  onChange: () => void;
}

interface AddedGuest {
  participantId: string;
  name: string;
}

/**
 * Host-only "add people at the door" card. Renders before the session ends
 * (mirror image of AttendanceTracker, which renders only after) for the creator
 * or an admin. Name only: the host types a name, taps Add, and the input keeps
 * focus so the next name can be typed immediately. Phone/email are not collected.
 */
export default function DoorCheckInCard({
  sessionId,
  isCreator,
  isAdmin,
  sessionDate,
  sessionStartTime,
  sessionEndTime,
  sessionStatus,
  language,
  onChange,
}: DoorCheckInCardProps) {
  const supabase = createClient();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const txt = {
    title: language === 'es' ? 'Registro en la puerta' : 'Door check in',
    help: language === 'es' ? 'Agrega a quienes llegaron. Solo el nombre.' : 'Add whoever showed up. Name only.',
    placeholder: language === 'es' ? 'Escribe un nombre' : 'Type a name',
    add: language === 'es' ? 'Agregar' : 'Add',
    empty:
      language === 'es'
        ? 'Nadie agregado todavía. Escribe un nombre y toca Agregar.'
        : 'No one added yet. Type a name and tap Add.',
    addError:
      language === 'es'
        ? 'No se pudo agregar a esa persona. Intenta de nuevo.'
        : 'Could not add that person. Try again.',
    removeError:
      language === 'es'
        ? 'No se pudo quitar a esa persona. Intenta de nuevo.'
        : 'Could not remove that person. Try again.',
    remove: language === 'es' ? 'Quitar' : 'Remove',
  };

  const canManage = isCreator || isAdmin;
  const ended = sessionHasEnded(sessionDate, sessionStartTime, sessionEndTime);
  if (!canManage || ended || sessionStatus === 'cancelled') {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    // Do not round-trip an empty name; the RPC would reject it anyway.
    if (!trimmed || adding) return;

    setError(null);
    setAdding(true);
    const result = await addSessionGuest(supabase, sessionId, trimmed);
    setAdding(false);

    if (result.success && result.data) {
      setAdded((prev) => [{ participantId: result.data!.participantId, name: trimmed }, ...prev]);
      setName('');
      onChange();
      // Keep the keyboard open and ready for the next name.
      inputRef.current?.focus();
    } else {
      setError(txt.addError);
    }
  }

  async function handleRemove(participantId: string) {
    if (removingId) return;
    setError(null);
    setRemovingId(participantId);
    const result = await removeSessionGuest(supabase, sessionId, participantId);
    setRemovingId(null);

    if (result.success) {
      setAdded((prev) => prev.filter((g) => g.participantId !== participantId));
      onChange();
    } else {
      setError(txt.removeError);
    }
  }

  return (
    <Card className="dark:bg-tribe-card shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">{txt.title}</h2>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{txt.help}</p>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={txt.placeholder}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            aria-label={txt.placeholder}
            className="flex-1 min-w-0 py-3 px-4 text-base rounded-lg bg-white dark:bg-tribe-mid border border-stone-200 dark:border-tribe-mid text-stone-900 dark:text-white placeholder-stone-400 focus:border-tribe-green focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || name.trim().length === 0}
            className="flex items-center gap-1.5 px-5 py-3 rounded-lg bg-tribe-green text-slate-900 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {txt.add}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 space-y-2">
          {added.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-gray-400">{txt.empty}</p>
          ) : (
            added.map((guest) => (
              <div
                key={guest.participantId}
                className="flex items-center justify-between p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg"
              >
                <span className="font-medium text-stone-900 dark:text-white truncate">{guest.name}</span>
                <button
                  onClick={() => handleRemove(guest.participantId)}
                  disabled={removingId === guest.participantId}
                  aria-label={`${txt.remove} ${guest.name}`}
                  className="p-2 rounded-lg text-stone-500 dark:text-gray-400 hover:bg-red-500 hover:text-white transition disabled:opacity-50"
                >
                  {removingId === guest.participantId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
