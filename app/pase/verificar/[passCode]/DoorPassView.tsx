'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { intlLocale } from '@/lib/atletas/locale';
import { createClient } from '@/lib/supabase/client';
import { confirmPassAttendance, type ConfirmMethod, type DoorPass } from '@/lib/dal/passDoor';
import DoorOutcomeButtons from '@/components/door/DoorOutcomeButtons';

/**
 * The door screen's content (T-AV21, extended by T-AV25). Copy: messages
 * "door" namespace (recon 5.2, EN approved 2026-09-29, ES as proposed; spec
 * 7.2 for door.nextClose).
 *
 * Confirm goes through confirmPassAttendance (av_confirm_pass_attendance) with
 * the method the page decided: `scan` from the voucher QR, `code` when typed.
 * Once confirmed, the gym's welcome offer ("Next: your close") and the four
 * outcomes. Nothing here writes a table directly; no client role can.
 */

interface DoorPassViewProps {
  passCode: string;
  pass: DoorPass | null;
  method?: ConfirmMethod;
  /** The read itself failed (transport error), as opposed to "not your gym". */
  readFailed?: boolean;
}

const OFFER_FOR: Record<string, 'welcomeOfferEs' | 'welcomeOfferEn'> = { es: 'welcomeOfferEs', en: 'welcomeOfferEn' };

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(intlLocale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

export default function DoorPassView({ passCode, pass, method = 'scan', readFailed = false }: DoorPassViewProps) {
  const { language } = useLanguage();
  const t = useTranslations('door');
  const [attendedAt, setAttendedAt] = useState<string | null>(pass?.attendedAt ?? null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(readFailed);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const result = await confirmPassAttendance(createClient(), passCode, method);
    setSaving(false);
    if (!result.success || !result.data) {
      setFailed(true);
      return;
    }
    setAttendedAt(result.data.attendedAt);
    setJustConfirmed(!result.data.alreadyConfirmed);
  }

  const offer = pass ? pass[OFFER_FOR[language] ?? 'welcomeOfferEs'] : null;

  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-8">
      <div className="mx-auto w-full max-w-[430px]">
        <h1 className="mb-6 text-center text-2xl font-extrabold text-white">{t('title')}</h1>

        {!pass ? (
          <section role="status" className="rounded-2xl bg-white p-6 text-center">
            <p className="text-base font-semibold text-tribe-dark">{failed ? t('error') : t('notYourGym')}</p>
          </section>
        ) : (
          <section className="rounded-2xl bg-white p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{t('gym')}</dt>
                <dd className="text-right font-semibold text-tribe-dark">{pass.partnerName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-stone-600">{t('guest')}</dt>
                <dd className="text-right font-semibold text-tribe-dark">{pass.guestFirstName}</dd>
              </div>
            </dl>
            {pass.athleteFirstName ? (
              <p
                data-invited-by
                className="mt-3 inline-block rounded-full bg-tribe-green px-3 py-1 text-sm font-semibold text-tribe-dark"
              >
                {t('invitedBy', { athlete: pass.athleteFirstName })}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-stone-600">
              {t('claimedOn', { date: formatDate(pass.claimedAt, language) })}
            </p>

            {attendedAt ? (
              <>
                <p
                  role="status"
                  className="mt-6 rounded-xl bg-tribe-green px-4 py-3 text-center text-base font-semibold text-tribe-dark"
                >
                  {justConfirmed ? t('confirmed') : t('alreadyConfirmed', { date: formatDate(attendedAt, language) })}
                </p>
                {offer ? (
                  <div data-welcome-offer className="mt-6 rounded-xl bg-stone-100 p-4">
                    <p className="text-sm font-semibold text-tribe-dark">{t('nextClose')}</p>
                    <p className="mt-1 text-sm text-stone-700">{offer}</p>
                  </div>
                ) : null}
                <div className="mt-6">
                  <DoorOutcomeButtons passCode={passCode} initialOutcome={pass.outcome} />
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
                className="mt-6 w-full rounded-xl bg-tribe-dark px-5 py-4 text-base font-semibold text-white disabled:opacity-50"
              >
                {t('confirm')}
              </button>
            )}

            {failed ? (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {t('error')}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
