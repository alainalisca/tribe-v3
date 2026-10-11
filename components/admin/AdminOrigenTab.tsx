'use client';

/**
 * The admin panel's Origen tab (T-GROW1 part F).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE QUESTION THIS SCREEN ANSWERS, AND WHY NOTHING ELSE COULD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Which free channel sent people who actually showed up." The Leads tab cannot
 * answer it: it lists leads, so a channel that sent 200 visitors and no leads and
 * a channel that sent nobody look identical there -- both are an absence of rows.
 * The visits column is the denominator those two cases differ in, and it is why
 * migration 213 exists.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NO CHART, AND THAT IS THE SPEC'S INSTRUCTION AND THE RIGHT CALL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Plain table, no chart library, no new dependencies." At four channels and
 * three live leads a chart would be decoration over a table that fits on one
 * screen, and the numbers are what go in a message to the next gym.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY NOT ON THIS SCREEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SIGNUPS AND BOOKINGS, which the spec's part F lists. Attributing either needs
 * the account-side columns in part C, and part C is blocked on data policy v1.1.
 * They are ABSENT rather than rendered as zeros, and there is a sentence saying
 * so: a zero in a column headed "Registros" is a measurement, and it would be
 * read as "this channel sent nobody who joined" when the truth is "nothing
 * records that yet". CLAUDE.md, on fabricated causes being more durable than
 * absent ones.
 *
 * THE SHOW-UP RATE IS A DASH, NOT 0%, when a channel has no leads, for the same
 * reason one level down.
 */

import { Users, Eye, Check, CalendarCheck } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useAdminOrigen } from '@/app/admin/useAdminOrigen';
import { showUpRate, type OriginGrouping, type OriginGroup, type OriginRange } from '@/lib/growth/originGrouping';
import TrackedLinkBuilder from './TrackedLinkBuilder';
import AdminReferidosSection from './AdminReferidosSection';

const TH = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-gray-400';
const TD = 'px-3 py-2 align-middle text-sm text-tribe-dark dark:text-white whitespace-nowrap';
/** Right-aligned, because a column of numbers is read by its last digit. */
const TDN = `${TD} text-right tabular-nums`;
const THN = `${TH} text-right`;

function Tile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-tribe-mid dark:bg-tribe-surface">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-gray-400">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100 dark:bg-tribe-mid">{icon}</div>
      </div>
      <p className="text-2xl font-extrabold text-tribe-dark dark:text-white">{value}</p>
    </div>
  );
}

/**
 * The dimension cell for a row, which depends on the grouping.
 *
 * ONE FUNCTION RATHER THAN THREE TABLES. The counts are identical across the
 * three groupings and only the leading columns change, so a table per grouping
 * would be three copies of five numeric columns that have to agree.
 */
function dimensionCells(group: OriginGroup, grouping: OriginGrouping, noSource: string) {
  const dash = <span className="text-stone-400 dark:text-gray-500">{noSource}</span>;
  if (grouping === 'src_code') {
    return (
      <>
        <td className={TD}>{group.src ?? dash}</td>
        <td className={`${TD} font-mono`}>{group.code ?? ''}</td>
      </>
    );
  }
  if (grouping === 'utm_campaign') {
    return <td className={TD}>{group.utm_campaign ?? dash}</td>;
  }
  return <td className={`${TD} font-mono`}>{group.attr_ref ?? dash}</td>;
}

export default function AdminOrigenTab() {
  const t = useTranslations('adminOrigen');
  const origen = useAdminOrigen({ loadError: t('loadError') });
  const { groups, total, grouping, range } = origen;

  const RANGES: Array<{ value: OriginRange; label: string }> = [
    { value: 7, label: t('range7') },
    { value: 30, label: t('range30') },
    { value: 90, label: t('range90') },
    { value: null, label: t('rangeAll') },
  ];

  return (
    <div className="space-y-4">
      {/* The tiles follow the SAME range as the table, so a number above the
          table is never about a different population from the rows in it. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t('colVisits')} value={total.visits} icon={<Eye className="h-4 w-4 text-tribe-green" />} />
        <Tile label={t('colLeads')} value={total.leads} icon={<Users className="h-4 w-4 text-tribe-green" />} />
        <Tile
          label={t('colContacted')}
          value={total.contacted}
          icon={<Check className="h-4 w-4 text-tribe-green-dark" />}
        />
        <Tile
          label={t('colAttended')}
          value={total.attended}
          icon={<CalendarCheck className="h-4 w-4 text-tribe-green-dark" />}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="origen-group" className={LABEL_CLASS}>
            {t('groupByLabel')}
          </label>
          <select
            id="origen-group"
            value={grouping}
            onChange={(e) => origen.setGrouping(e.target.value as OriginGrouping)}
            className={SELECT_CLASS}
          >
            <option value="src_code">{t('groupSrcCode')}</option>
            <option value="utm_campaign">{t('groupCampaign')}</option>
            <option value="attr_ref">{t('groupRef')}</option>
          </select>
        </div>

        <div>
          <span className={LABEL_CLASS}>{t('rangeLabel')}</span>
          {/* Buttons rather than a select: four options that get switched between
              constantly, and a segmented control shows which one is active
              without opening anything. */}
          <div className="flex gap-1" role="group" aria-label={t('rangeLabel')}>
            {RANGES.map((r) => (
              <button
                key={String(r.value)}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => origen.setRange(r.value)}
                className={`min-h-[44px] rounded-lg px-3 text-sm font-medium transition ${
                  range === r.value
                    ? 'bg-tribe-green text-tribe-dark'
                    : 'border border-stone-300 text-stone-600 dark:border-tribe-mid dark:text-gray-400'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500 dark:text-gray-400">{t('empty')}</p>
      ) : (
        // Scrolls INSIDE its own container, never pushing the page sideways.
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-tribe-mid">
          <table className="min-w-full border-collapse">
            <thead className="bg-stone-100 dark:bg-tribe-mid">
              <tr>
                {grouping === 'src_code' && (
                  <>
                    <th className={TH}>{t('colSource')}</th>
                    <th className={TH}>{t('colCode')}</th>
                  </>
                )}
                {grouping === 'utm_campaign' && <th className={TH}>{t('colCampaign')}</th>}
                {grouping === 'attr_ref' && <th className={TH}>{t('colRef')}</th>}
                <th className={THN}>{t('colVisits')}</th>
                <th className={THN}>{t('colLeads')}</th>
                <th className={THN}>{t('colContacted')}</th>
                <th className={THN}>{t('colAttended')}</th>
                <th className={THN}>{t('colRate')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const rate = showUpRate(g);
                return (
                  <tr key={g.key} className="border-t border-stone-200 dark:border-tribe-mid">
                    {dimensionCells(g, grouping, t('noSource'))}
                    <td className={TDN}>{g.visits}</td>
                    <td className={TDN}>{g.leads}</td>
                    <td className={TDN}>{g.contacted}</td>
                    <td className={TDN}>{g.attended}</td>
                    {/* A DASH, not 0%. A channel with no leads has no show-up
                        rate, and "0%" claims a measurement nobody took. */}
                    <td className={TDN}>{rate === null ? '—' : `${rate}%`}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-stone-300 bg-stone-50 font-bold dark:border-tribe-mid dark:bg-tribe-mid/40">
                <td className={TD} colSpan={grouping === 'src_code' ? 2 : 1}>
                  {t('total')}
                </td>
                <td className={TDN}>{total.visits}</td>
                <td className={TDN}>{total.leads}</td>
                <td className={TDN}>{total.contacted}</td>
                <td className={TDN}>{total.attended}</td>
                <td className={TDN}>{showUpRate(total) === null ? '—' : `${showUpRate(total)}%`}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* The missing columns, said in words. An absent column with no explanation
          reads as an oversight; a zero would read as a measurement. */}
      <p className="text-xs leading-relaxed text-stone-500 dark:text-gray-400">{t('pendingNote')}</p>

      {/* T-GROW2 C. Same range as the table above, by construction. */}
      <AdminReferidosSection range={range} />

      <TrackedLinkBuilder />
    </div>
  );
}

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-stone-600 dark:text-gray-400';
const SELECT_CLASS =
  'min-h-[44px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-tribe-dark dark:border-tribe-mid dark:bg-tribe-surface dark:text-white';
