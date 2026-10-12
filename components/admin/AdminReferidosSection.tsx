'use client';

/**
 * "Referidos" inside the admin Origen tab (T-GROW2 C): who brought whom.
 *
 * Follows the tab's range, so this table and the Origen table above it are
 * always about the same period. Reads /api/admin/data?tab=referidos, which is
 * service-role behind requireApiAdmin(); only counts and a display name come
 * back, never a referred person's contact fields.
 *
 * "Self" is shown, not dropped: the self-referral guard (spec D) excludes a
 * referred lead or signup sharing the referrer's phone or email from the counts,
 * and showing how many it set aside is what makes the guard auditable.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { OriginRange } from '@/lib/growth/originGrouping';
import type { ReferralRow } from '@/lib/growth/referralSummary';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';

const TH = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-gray-400';
const TD = 'px-3 py-2 align-middle text-sm text-tribe-dark dark:text-white whitespace-nowrap';
const TDN = `${TD} text-right tabular-nums`;
const THN = `${TH} text-right`;

export default function AdminReferidosSection({ range }: { range: OriginRange }) {
  const t = useTranslations('adminOrigen');
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load must never render the empty state: "no referrals" after a
  // failure is a fabricated finding, not a missing one.
  const [failed, setFailed] = useState(false);
  const loadError = t('loadError');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const qs = new URLSearchParams({ tab: 'referidos', days: range === null ? 'all' : String(range) });
    fetch(`/api/admin/data?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`admin_api_${res.status}`);
        const json = (await res.json()) as { data?: ReferralRow[] };
        if (!json.data) throw new Error('admin_api_empty');
        if (!cancelled) setRows(json.data);
      })
      .catch((error) => {
        // Rows already on screen stay; an empty table after a failed refresh
        // would read as "nobody referred anyone".
        logError(error, { action: 'AdminReferidosSection.load', range });
        if (!cancelled) {
          setFailed(true);
          showError(loadError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, loadError]);

  return (
    <section aria-labelledby="referidos-title" className="space-y-2">
      <h3 id="referidos-title" className="text-base font-bold text-tribe-dark dark:text-white">
        {t('referidosTitle')}
      </h3>
      <p className="text-xs leading-relaxed text-stone-500 dark:text-gray-400">{t('referidosNote')}</p>
      {(loading || failed) && rows.length === 0 ? null : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500 dark:text-gray-400">{t('referidosEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-tribe-mid">
          <table className="min-w-full border-collapse">
            <thead className="bg-stone-100 dark:bg-tribe-mid">
              <tr>
                <th className={TH}>{t('colReferrer')}</th>
                <th className={TH}>{t('colCode')}</th>
                <th className={THN}>{t('colLeads')}</th>
                <th className={THN}>{t('colAttended')}</th>
                <th className={THN}>{t('colSignups')}</th>
                <th className={THN}>{t('colSelf')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-stone-200 dark:border-tribe-mid">
                  <td className={TD}>
                    {r.referrer ?? <span className="text-stone-400 dark:text-gray-500">{t('unknownReferrer')}</span>}
                  </td>
                  <td className={`${TD} font-mono`}>{r.code}</td>
                  <td className={TDN}>{r.leads}</td>
                  <td className={TDN}>{r.attended}</td>
                  <td className={TDN}>{r.signups}</td>
                  <td className={TDN}>{r.selfExcluded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
