'use client';

/**
 * One athlete's row on the host's attendance card, in two shapes.
 *
 * LegacyAttendanceRow is the card as it was before T-AV2 (a check and a cross),
 * shown while the athlete_value flag is off so a host sees exactly what main
 * shows. MarkAttendanceRow is T-AV2's three states: Attended, No-show, or not
 * marked; tapping the active choice again un-marks.
 */
import { Check, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { AttendanceStatus } from '@/lib/dal/attendanceMarks';

export interface AttendanceRowPerson {
  user_id: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
  status: AttendanceStatus | null;
}

function Person({ person }: { person: AttendanceRowPerson }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="w-10 h-10">
        <AvatarImage src={person.user?.avatar_url || undefined} alt={person.user?.name || ''} />
        <AvatarFallback className="bg-tribe-green text-slate-900 font-bold">
          {person.user?.name?.[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-stone-900 dark:text-white truncate">{person.user?.name}</span>
    </div>
  );
}

export function LegacyAttendanceRow({
  person,
  busy,
  onMark,
}: {
  person: AttendanceRowPerson;
  busy: boolean;
  onMark: (status: AttendanceStatus) => void;
}) {
  const attended = person.status === 'attended';
  return (
    <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg">
      <Person person={person} />
      <div className="flex gap-2">
        <button
          onClick={() => onMark('attended')}
          disabled={attended || busy}
          className={`p-2 rounded-lg transition ${
            attended
              ? 'bg-green-500 text-white'
              : 'bg-stone-200 dark:bg-tribe-card text-stone-600 dark:text-gray-400 hover:bg-green-500 hover:text-white'
          }`}
          title="Mark as attended"
          aria-label={`Mark ${person.user?.name || 'athlete'} as attended`}
        >
          {busy ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            <Check className="w-5 h-5" />
          )}
        </button>
        <button
          onClick={() => onMark('no_show')}
          disabled={!attended || busy}
          className={`p-2 rounded-lg transition ${
            !attended
              ? 'bg-red-500 text-white'
              : 'bg-stone-200 dark:bg-tribe-card text-stone-600 dark:text-gray-400 hover:bg-red-500 hover:text-white'
          }`}
          title="Mark as not attended"
          aria-label={`Mark ${person.user?.name || 'athlete'} as not attended`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export function MarkAttendanceRow({
  person,
  busy,
  language,
  onMark,
}: {
  person: AttendanceRowPerson;
  busy: boolean;
  language: 'en' | 'es';
  onMark: (status: AttendanceStatus | null) => void;
}) {
  const choices: Array<{ status: AttendanceStatus; label: string; on: string }> = [
    { status: 'attended', label: language === 'es' ? 'Asistió' : 'Attended', on: 'bg-tribe-green text-tribe-dark' },
    { status: 'no_show', label: language === 'es' ? 'No vino' : 'No-show', on: 'bg-tribe-dark text-white' },
  ];
  return (
    <div className="flex items-center justify-between gap-2 p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg">
      <Person person={person} />
      <div className="flex gap-2 shrink-0" role="group" aria-label={person.user?.name || ''}>
        {choices.map((c) => {
          const active = person.status === c.status;
          return (
            <button
              key={c.status}
              type="button"
              onClick={() => onMark(active ? null : c.status)}
              disabled={busy}
              aria-pressed={active}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-60 ${
                active ? c.on : 'bg-stone-200 dark:bg-tribe-card text-stone-700 dark:text-gray-300'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
