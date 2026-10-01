'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { intlLocale } from '@/lib/atletas/locale';
import { createClient } from '@/lib/supabase/client';
import { confirmPassAttendance, type DoorListEntry } from '@/lib/dal/passDoor';
import { notifyAthlete } from '@/lib/atletas/notifyAthlete';
import DoorOutcomeButtons from '@/components/door/DoorOutcomeButtons';
import DoorCodeEntry from './DoorCodeEntry';

/**
 * T-AV25: the passes claimed at this gym in the last 14 days (av_door_list,
 * already filtered to this partner in the database). Each row: "Llegó"
 * (method `toggle`) until confirmed, then the four outcomes. First names only.
 */

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(intlLocale(language), { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
}

function DoorRow({ entry }: { entry: DoorListEntry }) {
  const { language } = useLanguage();
  const t = useTranslations('door');
  const [attendedAt, setAttendedAt] = useState<string | null>(entry.attendedAt);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function arrived() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await confirmPassAttendance(createClient(), entry.passCode, 'toggle');
    setBusy(false);
    if (!result.success || !result.data) {
      setFailed(true);
      return;
    }
    setAttendedAt(result.data.attendedAt);
    notifyAthlete(entry.passCode, 'arrived');
  }

  return (
    <li
      className="rounded-2xl bg-white p-4"
      data-door-row={entry.passCode}
      data-attended={attendedAt ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-tribe-dark">{entry.guestFirstName}</p>
          <p className="text-xs text-stone-600">
            {formatDate(entry.claimedAt, language)} · {entry.passCode}
          </p>
          {entry.athleteFirstName ? (
            <p className="mt-1 inline-block rounded-full bg-tribe-green px-2 py-0.5 text-xs font-semibold text-tribe-dark">
              {t('invitedBy', { athlete: entry.athleteFirstName })}
            </p>
          ) : null}
        </div>
        {!attendedAt ? (
          <button
            type="button"
            onClick={arrived}
            disabled={busy}
            data-arrived
            className="flex-shrink-0 rounded-xl bg-tribe-dark px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t('listArrived')}
          </button>
        ) : null}
      </div>
      {attendedAt ? (
        <div className="mt-3">
          <DoorOutcomeButtons passCode={entry.passCode} initialOutcome={entry.outcome} />
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {t('error')}
        </p>
      ) : null}
    </li>
  );
}

export default function DoorList({ entries }: { entries: DoorListEntry[] }) {
  const t = useTranslations('door');
  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-8">
      <div className="mx-auto w-full max-w-[430px] space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-white">{t('listTitle')}</h1>
          <p className="mt-1 text-sm text-white/80">{t('listHelp')}</p>
        </div>
        <DoorCodeEntry />
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-600">{t('listEmpty')}</p>
        ) : (
          <ul className="space-y-3" data-door-list>
            {entries.map((entry) => (
              <DoorRow key={entry.passCode} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
