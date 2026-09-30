'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { confirmPassAttendance, type DoorPass } from '@/lib/dal/passDoor';

/**
 * The door screen's content (T-AV21). Copy is recon 5.2's door.* rows, EN
 * approved by Al on 2026-09-29, ES as proposed there.
 *
 * The confirm goes through confirmPassAttendance, the DAL over the
 * av_confirm_pass_attendance RPC. Nothing here writes pass_leads directly;
 * no client role can.
 */

interface DoorPassViewProps {
  passCode: string;
  pass: DoorPass | null;
  /** The read itself failed (transport error), as opposed to "not your gym". */
  readFailed?: boolean;
}

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

export default function DoorPassView({ passCode, pass, readFailed = false }: DoorPassViewProps) {
  const { language } = useLanguage();
  const es = language === 'es';
  const [attendedAt, setAttendedAt] = useState<string | null>(pass?.attendedAt ?? null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(readFailed);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const result = await confirmPassAttendance(createClient(), passCode, 'scan');
    setSaving(false);
    if (!result.success || !result.data) {
      setFailed(true);
      return;
    }
    setAttendedAt(result.data.attendedAt);
    setJustConfirmed(!result.data.alreadyConfirmed);
  }

  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-8">
      <div className="mx-auto w-full max-w-[430px]">
        <h1 className="mb-6 text-center text-2xl font-extrabold text-white">
          {es ? 'Confirmar asistencia' : 'Confirm attendance'}
        </h1>

        {!pass ? (
          <section role="status" className="rounded-2xl bg-white p-6 text-center">
            <p className="text-base font-semibold text-tribe-dark">
              {failed
                ? es
                  ? 'No pudimos guardar eso. Intenta de nuevo.'
                  : 'We could not save that. Try again.'
                : es
                  ? 'Este pase no es de tu gimnasio.'
                  : 'This pass is not for your gym.'}
            </p>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{es ? 'Gimnasio' : 'Gym'}</dt>
                <dd className="text-right font-semibold text-tribe-dark">{pass.partnerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{es ? 'Invitado' : 'Guest'}</dt>
                <dd className="text-right font-semibold text-tribe-dark">{pass.guestFirstName}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-stone-600">
              {es
                ? `Reclamado el ${formatDate(pass.claimedAt, language)}`
                : `Claimed on ${formatDate(pass.claimedAt, language)}`}
            </p>

            {attendedAt ? (
              <p
                role="status"
                className="mt-6 rounded-xl bg-tribe-green px-4 py-3 text-center text-base font-semibold text-tribe-dark"
              >
                {justConfirmed
                  ? es
                    ? 'Asistencia confirmada'
                    : 'Attendance confirmed'
                  : es
                    ? `Ya se confirmó el ${formatDate(attendedAt, language)}`
                    : `Already confirmed on ${formatDate(attendedAt, language)}`}
              </p>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="mt-6 w-full rounded-xl bg-tribe-dark px-5 py-4 text-base font-semibold text-white disabled:opacity-50"
              >
                {es ? 'Confirmar asistencia' : 'Confirm attendance'}
              </button>
            )}

            {failed ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {es ? 'No pudimos guardar eso. Intenta de nuevo.' : 'We could not save that. Try again.'}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
