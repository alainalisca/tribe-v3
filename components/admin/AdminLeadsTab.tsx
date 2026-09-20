'use client';

/**
 * The admin panel's Leads tab (T-LEAD2 part B).
 *
 * Before this, the only place a pass lead could be read was Al's inbox, because
 * his address is on partner_lead_routing.lead_cc. That cc is a stopgap and
 * comes off once this has been used against production.
 *
 * PAGINATION IS NET-NEW HERE. No other admin tab has any: users, reports,
 * feedback, bugs and messages each take a fixed .limit() window and render it.
 * That is the wrong failure for a leads list -- the day it matters, somebody is
 * looking for a lead from three weeks ago and it is simply not there, with
 * nothing on screen saying so. This uses the repo's .range() idiom with an
 * exact count, so the pager can say how many rows exist rather than implying
 * the page is all of them.
 */
import { Users, Clock, Inbox } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_LEADS_ALL_PARTNERS } from '@/lib/dal/adminLeads';
import { useAdminLeads } from '@/app/admin/useAdminLeads';
import LeadsTable from './LeadsTable';

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

export default function AdminLeadsTab({ supabase }: { supabase: SupabaseClient }) {
  const t = useTranslations('adminLeads');
  const leads = useAdminLeads(supabase, {
    loadError: t('loadError'),
    toggleError: t('toggleError'),
    markedContacted: t('markedContacted'),
    markedPending: t('markedPending'),
  });

  const { page } = leads;

  return (
    <div className="space-y-4">
      {/*
        THE TILES FOLLOW THE PARTNER FILTER. A tile reading "leads totales: 40"
        above a table showing one partner's 6 would be a number about a
        different population than the one on screen.
      */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t('tileLast7')} value={page.tiles.last7} icon={<Clock className="h-4 w-4 text-tribe-green" />} />
        <Tile
          label={t('tileUncontacted')}
          value={page.tiles.uncontacted}
          icon={<Inbox className="h-4 w-4 text-orange-500" />}
        />
        <Tile label={t('tileTotal')} value={page.tiles.total} icon={<Users className="h-4 w-4 text-tribe-green" />} />
      </div>

      {/* Only when there is a choice to make. A select with one option is a
          control that cannot do anything. */}
      {page.partners.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="admin-leads-partner" className="text-sm font-medium text-stone-600 dark:text-gray-400">
            {t('filterLabel')}
          </label>
          <select
            id="admin-leads-partner"
            value={leads.partnerId}
            onChange={(e) => leads.selectPartner(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-tribe-dark dark:border-tribe-mid dark:bg-tribe-surface dark:text-white"
          >
            <option value={ADMIN_LEADS_ALL_PARTNERS}>{t('filterAll')}</option>
            {page.partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <LeadsTable
        rows={page.rows}
        showPartner
        showAccount
        togglingId={leads.togglingId}
        onToggleContacted={leads.toggleContacted}
      />

      {/* The range is always shown, even on a single page. "1-2 de 2" is what
          tells an admin the list is complete; a bare Prev/Next pair leaves them
          guessing whether there is more behind it. */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500 dark:text-gray-400">
          {t('range', { from: leads.from, to: leads.to, total: page.total })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={leads.goPrev}
            disabled={!leads.hasPrev || leads.loading}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-tribe-dark disabled:opacity-40 dark:border-tribe-mid dark:text-white"
          >
            {t('prev')}
          </button>
          <button
            type="button"
            onClick={leads.goNext}
            disabled={!leads.hasNext || leads.loading}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-tribe-dark disabled:opacity-40 dark:border-tribe-mid dark:text-white"
          >
            {t('next')}
          </button>
        </div>
      </div>
    </div>
  );
}
