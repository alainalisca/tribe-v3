'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { intlLocale } from '@/lib/atletas/locale';
import type { AthleteGuestView, AthleteMemberView } from '@/lib/atletas/athleteHomeView';

/**
 * "Mis invitados": first name, claim date, status, and why a guest does not
 * count. Never contact details (D4), and never follow_up or not_now: those
 * are the gym's sales notes, and my_summary collapses them before they leave
 * the database.
 */

type T = ReturnType<typeof useTranslations>;

function statusLabel(status: AthleteGuestView['status'], t: T): string {
  switch (status) {
    case 'retained':
      return t('statusStayed');
    case 'joined':
      return t('statusJoined');
    case 'showed_up':
      return t('statusArrived');
    default:
      return t('statusClaimed');
  }
}

/** Reason copy: recon 5.3, plus Al's 2026-09-30 strings (self-referral split by channel). */
export function reasonLabel(reason: string, gym: string, t: T): string | null {
  switch (reason) {
    case 'already_member':
      return t('reasonMember', { gym });
    case 'returning':
      return t('reasonReturning', { gym });
    case 'duplicate':
      return t('reasonDuplicate');
    case 'self_email':
      return t('reasonSelfEmail');
    case 'self_whatsapp':
      return t('reasonSelfWhatsapp');
    default:
      return null;
  }
}

function formatDate(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(intlLocale(language), { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
}

export default function AthleteGuests({ view }: { view: AthleteMemberView }) {
  const { language } = useLanguage();
  const t = useTranslations('athleteHome');

  return (
    <section className="rounded-2xl bg-theme-card p-5">
      <h2 className="text-lg font-bold text-theme-primary">{t('guestsTitle')}</h2>
      {view.guests.length === 0 ? (
        <p className="mt-2 text-sm text-theme-secondary">{t('guestsEmpty')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 dark:divide-white/10">
          {view.guests.map((g, i) => {
            const reason = g.noCreditReason ? reasonLabel(g.noCreditReason, view.partnerName, t) : null;
            return (
              <li
                key={`${g.claimedAt}-${i}`}
                className="flex items-start justify-between gap-3 py-3"
                data-guest-status={g.noCreditReason ? 'no_credit' : g.status}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-theme-primary">{g.firstName}</p>
                  <p className="text-xs text-theme-secondary">{formatDate(g.claimedAt, language)}</p>
                  {reason ? <p className="mt-1 text-xs text-theme-secondary">{reason}</p> : null}
                </div>
                <span
                  className={
                    g.noCreditReason
                      ? 'flex-shrink-0 rounded-full bg-theme-inset px-3 py-1 text-xs font-semibold text-theme-secondary'
                      : 'flex-shrink-0 rounded-full bg-tribe-green px-3 py-1 text-xs font-semibold text-tribe-dark'
                  }
                >
                  {g.noCreditReason ? t('statusNoCredit') : statusLabel(g.status, t)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
