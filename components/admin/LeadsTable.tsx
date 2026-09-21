'use client';

/**
 * The leads table (T-LEAD2).
 *
 * ONE TABLE, TWO AUDIENCES. The admin tab shows every lead with an Aliado
 * column and a Cuenta column; the partner dashboard shows its own rows with
 * neither. Those are the only differences, so they are props rather than a
 * second component -- a forked copy is how the two drift until the partner's
 * view quietly stops showing a column the admin relies on.
 *
 * Read-only except the Contactado toggle. Every other cell renders a column
 * nothing in this app may write from the client: pass_leads grants
 * `authenticated` no UPDATE at all, and the toggle reaches contacted_at through
 * a SECURITY DEFINER function that can touch nothing else.
 */
import { Check, AlertTriangle } from 'lucide-react';
import { waMeDigits } from '@/lib/pase/phone';
import { bogotaDateTimeLabel } from '@/lib/time/bogotaDate';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLanguage } from '@/lib/LanguageContext';

/**
 * What the table needs of a lead.
 *
 * partnerName and hasTribeAccount are optional because only the admin read can
 * produce them: the first needs a join the partner view has no use for, the
 * second needs public.users.email, which no client role can select.
 */
export interface LeadRow {
  id: string;
  created_at: string;
  name: string;
  whatsapp: string;
  email: string;
  choice_1: string | null;
  choice_2: string | null;
  pass_code: string;
  src: string | null;
  code: string | null;
  notified_at: string | null;
  contacted_at: string | null;
  partnerName?: string | null;
  hasTribeAccount?: boolean;
}

interface Props {
  rows: LeadRow[];
  /** The admin tab; off for a partner looking at their own leads. */
  showPartner?: boolean;
  /** Needs the service-role read, so off wherever the rows came from a client. */
  showAccount?: boolean;
  togglingId: string | null;
  onToggleContacted: (leadId: string, contacted: boolean) => void;
}

const TH = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-gray-400';
const TD = 'px-3 py-2 align-middle text-sm text-tribe-dark dark:text-white whitespace-nowrap';

export default function LeadsTable({ rows, showPartner, showAccount, togglingId, onToggleContacted }: Props) {
  const t = useTranslations('adminLeads');
  const { language } = useLanguage();

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-stone-500 dark:text-gray-400">{t('empty')}</p>;
  }

  return (
    // The table is wider than a phone and must scroll INSIDE its own container,
    // never push the page sideways.
    <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-tribe-mid">
      <table className="min-w-full border-collapse">
        <thead className="bg-stone-100 dark:bg-tribe-mid">
          <tr>
            <th className={TH}>{t('colDate')}</th>
            {showPartner && <th className={TH}>{t('colPartner')}</th>}
            <th className={TH}>{t('colName')}</th>
            <th className={TH}>{t('colWhatsapp')}</th>
            <th className={TH}>{t('colEmail')}</th>
            <th className={TH}>{t('colInterest')}</th>
            <th className={TH}>{t('colPass')}</th>
            <th className={TH}>{t('colSource')}</th>
            <th className={TH}>{t('colNotified')}</th>
            <th className={TH}>{t('colContacted')}</th>
            {showAccount && <th className={TH}>{t('colAccount')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Blank parts omitted, so one answer renders as "HYROX" rather
            // than "HYROX · ".
            const interest = [row.choice_1, row.choice_2].filter(Boolean).join(' · ');
            // src and code are independent: a lead can carry one without the
            // other. Both missing is the only case that gets a sentence.
            const source = [row.src, row.code].filter(Boolean).join(' · ');
            const digits = waMeDigits(row.whatsapp);
            const contacted = !!row.contacted_at;

            return (
              <tr key={row.id} className="border-t border-stone-200 dark:border-tribe-mid">
                <td className={TD}>{bogotaDateTimeLabel(row.created_at, language)}</td>
                {showPartner && <td className={TD}>{row.partnerName ?? ''}</td>}
                <td className={TD}>{row.name}</td>
                <td className={TD}>
                  {/* Displayed as stored (E.164) so it can be read back against
                      the row; wa.me needs the plus stripped, which is the one
                      thing waMeDigits does. */}
                  {digits ? (
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      {row.whatsapp}
                    </a>
                  ) : (
                    row.whatsapp
                  )}
                </td>
                <td className={TD}>
                  <a href={`mailto:${row.email}`} className="underline">
                    {row.email}
                  </a>
                </td>
                <td className={TD}>{interest}</td>
                <td className={`${TD} font-mono`}>{row.pass_code}</td>
                <td className={TD}>
                  {source || <span className="text-stone-500 dark:text-gray-400">{t('noSource')}</span>}
                </td>
                <td className={TD}>
                  {row.notified_at ? (
                    // Icon only: a tick in a column headed "Email enviado" is
                    // unambiguous, and the failure state is the one that needs
                    // words.
                    <Check className="h-4 w-4 text-tribe-green-dark" aria-label={t('colNotified')} />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      {t('notSent')}
                    </span>
                  )}
                </td>
                <td className={TD}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={contacted}
                    aria-label={t('colContacted')}
                    disabled={togglingId === row.id}
                    onClick={() => onToggleContacted(row.id, !contacted)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
                      contacted ? 'bg-tribe-green' : 'bg-stone-300 dark:bg-tribe-mid'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                        contacted ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                {showAccount && (
                  // Blank, not "no". An empty cell says "not a member"; the word
                  // "no" in a column of mostly-blank cells reads as a finding.
                  <td className={TD}>{row.hasTribeAccount ? t('accountYes') : ''}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
