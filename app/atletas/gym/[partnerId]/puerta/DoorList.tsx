'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { formatShortDate } from '@/lib/atletas/locale';
import { createClient } from '@/lib/supabase/client';
import { confirmPassAttendance, type DoorListEntry } from '@/lib/dal/passDoor';
import { notifyAthlete } from '@/lib/atletas/notifyAthlete';
import DoorOutcomeButtons from '@/components/door/DoorOutcomeButtons';
import DoorCodeEntry from './DoorCodeEntry';

/**
 * T-AV25: the passes claimed at this gym in the last 14 days (av_door_list,
 * already filtered to this partner in the database). First names only.
 *
 * T-AV28 (Al's browser test, 2026-10-01): titled "Lista de la puerta", like
 * the dashboard's button, and split in two:
 *   "Por llegar"   each row has "Llegó" (method `toggle`); tapping it moves the
 *                  guest to the other section
 *   "Ya llegaron"  the four outcomes sit behind "Registrar resultado", one
 *                  guest open at a time, as on the dashboard's Invitados
 * So the arrived state lives in the list, not in each row.
 */

interface DoorRowProps {
  entry: DoorListEntry;
  attendedAt: string | null;
  onArrived: (attendedAt: string) => void;
  outcomesOpen: boolean;
  onToggleOutcomes: () => void;
}

function DoorRow({ entry, attendedAt, onArrived, outcomesOpen, onToggleOutcomes }: DoorRowProps) {
  const { language } = useLanguage();
  const t = useTranslations('door');
  const tg = useTranslations('gym');
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
    onArrived(result.data.attendedAt);
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
            {formatShortDate(entry.claimedAt, language)} · {entry.passCode}
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
        ) : (
          <button
            type="button"
            aria-expanded={outcomesOpen}
            data-action="record-outcome"
            onClick={onToggleOutcomes}
            className="flex-shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-tribe-dark"
          >
            {tg('recordOutcome')}
          </button>
        )}
      </div>
      {attendedAt && outcomesOpen ? (
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
  // Confirmations made on this screen, so a guest moves sections at once.
  const [arrivedNow, setArrivedNow] = useState<Record<string, string>>({});
  const [openCode, setOpenCode] = useState<string | null>(null);
  const attendedOf = (e: DoorListEntry) => arrivedNow[e.passCode] ?? e.attendedAt;
  const notHere = entries.filter((e) => !attendedOf(e));
  const here = entries.filter((e) => attendedOf(e));

  const row = (e: DoorListEntry) => (
    <DoorRow
      key={e.passCode}
      entry={e}
      attendedAt={attendedOf(e)}
      onArrived={(at) => setArrivedNow((m) => ({ ...m, [e.passCode]: at }))}
      outcomesOpen={openCode === e.passCode}
      onToggleOutcomes={() => setOpenCode((c) => (c === e.passCode ? null : e.passCode))}
    />
  );

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
          <div className="space-y-6" data-door-list>
            {notHere.length > 0 ? (
              <section data-door-section="not-here">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white">{t('listNotHere')}</h2>
                <ul className="space-y-3">{notHere.map(row)}</ul>
              </section>
            ) : null}
            {here.length > 0 ? (
              <section data-door-section="here">
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white">{t('listHere')}</h2>
                <ul className="space-y-3">{here.map(row)}</ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
