'use client';

import { useMemo } from 'react';
import AttendanceTracker, { type AttendanceSource } from '@/components/AttendanceTracker';
import type { AttendanceStatus } from '@/lib/dal/attendanceMarks';

/**
 * /dev/attendance's client half: a session that started 30 minutes ago in
 * Medellín, four athletes in every state (unmarked, Asistió, No vino) and one
 * "Quién llegó" door guest with no account, who must not appear on the card.
 * The source keeps marks in memory and writes nothing.
 */
const HOST = 'u-host';
const people = [
  { user_id: 'u-ana', name: 'Ana María Restrepo' },
  { user_id: 'u-juan', name: 'Juan Pablo Gómez' },
  { user_id: 'u-vale', name: 'Valentina Ríos' },
  { user_id: 'u-mateo', name: 'Mateo Arango' },
];

function startedHalfAnHourAgo() {
  const bogota = new Date(Date.now() - 5 * 3600 * 1000 - 30 * 60 * 1000).toISOString();
  return { date: bogota.slice(0, 10), start: bogota.slice(11, 19) };
}

export default function DevAttendanceView({ threeState }: { threeState: boolean }) {
  const times = useMemo(startedHalfAnHourAgo, []);
  const source = useMemo<AttendanceSource>(() => {
    const marks = new Map<string, AttendanceStatus | null>([
      ['u-juan', 'attended'],
      ['u-vale', 'no_show'],
    ]);
    return {
      threeState,
      participants: async () => ({
        success: true,
        data: [
          { user_id: HOST, status: 'confirmed', user: { id: HOST, name: 'Salomon Tabares', avatar_url: null } },
          ...people.map((p) => ({
            user_id: p.user_id,
            status: 'confirmed',
            user: { id: p.user_id, name: p.name, avatar_url: null },
          })),
          // A door guest from "Quién llegó": a name, no account.
          { user_id: null, status: 'confirmed', is_guest: true, guest_name: 'Carolina', user: null },
        ] as never,
      }),
      marks: async (_s, _session, userIds) => ({
        success: true,
        data: userIds
          .filter((id) => marks.has(id))
          .map((id) => ({ user_id: id, status: marks.get(id) ?? null, attended: marks.get(id) === 'attended' })),
      }),
      mark: async (_s, _session, userId, status) => {
        marks.set(userId, status);
        return { success: true };
      },
      notify: async () => undefined,
    };
  }, [threeState]);

  return (
    <div className="min-h-screen bg-theme-page">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p className="text-xs text-stone-500">
          /dev/attendance · {threeState ? 'athlete_value "attendance" on' : 'feature off (the card main shows)'} · fixture
          data, nothing is saved
        </p>
        <AttendanceTracker
          sessionId="00000000-0000-4000-8000-0000000000a2"
          creatorId={HOST}
          isHost
          isAdmin={false}
          sessionDate={times.date}
          sessionStartTime={times.start}
          sessionEndTime={null}
          sessionDurationMinutes={90}
          source={source}
        />
      </div>
    </div>
  );
}
