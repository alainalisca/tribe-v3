'use client';

/**
 * The partner dashboard's leads section (T-LEAD2 part D).
 *
 * The spec's line about the emails is the reason this exists: "the email is
 * still the partner's product". A gym gets one message per lead and nowhere to
 * see the list, count it, or record that they called someone back. The inbox
 * is a delivery mechanism, not a workspace.
 *
 * THE SAME TABLE AS THE ADMIN TAB, WITH TWO COLUMNS OFF. LeadsTable takes
 * showPartner and showAccount as props precisely so this screen can be the same
 * component: Aliado is meaningless when every row belongs to the one partner
 * reading it, and Cuenta needs public.users.email, which no client role can
 * select. A forked copy is how the two views drift until the partner's quietly
 * stops showing something Al relies on.
 *
 * NO PARTNER FILTER, because there is nothing to filter between. The scoping is
 * migration 173's "Partner reads own leads" policy, in the database, not a
 * select on this page.
 *
 * THE adminLeads TRANSLATION NAMESPACE ON A PARTNER SCREEN IS DELIBERATE. The
 * table is shared, so its column strings are shared, and splitting the
 * namespace would mean two copies of eleven column headings that have to agree.
 * The namespace is named for where it first shipped, not for who may read it.
 */
import { Clock, Inbox, Users } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import LeadsTable from '@/components/admin/LeadsTable';
import type { PartnerLeadsPage } from '@/lib/dal/partnerLeads';

interface Props {
  gymName: string;
  page: PartnerLeadsPage;
  loading: boolean;
  togglingId: string | null;
  onToggleContacted: (leadId: string, contacted: boolean) => void;
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function Tile({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-theme bg-theme-inset p-3">
      <div className="mb-1 flex items-center justify-between gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-theme-tertiary">{label}</p>
        {icon}
      </div>
      <p className="text-xl font-extrabold text-theme-primary">{value}</p>
    </div>
  );
}

export default function PartnerLeadsSection({
  gymName,
  page,
  loading,
  togglingId,
  onToggleContacted,
  from,
  to,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: Props) {
  const t = useTranslations('adminLeads');

  return (
    <section className="bg-theme-card rounded-2xl border border-theme p-4 space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-theme-primary">{t('partnerSectionTitle')}</h2>
        {page.tiles.uncontacted > 0 && (
          // Green as a fill behind dark text, never as the label colour: no
          // green in the palette clears AA as small text on a light surface.
          <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-tribe-green px-1.5 text-xs font-bold text-tribe-dark">
            {page.tiles.uncontacted}
          </span>
        )}
      </div>
      <p className="text-xs text-theme-tertiary">{t('partnerSectionHelp', { gym: gymName })}</p>

      <div className="grid grid-cols-3 gap-2">
        <Tile
          label={t('tileLast7')}
          value={page.tiles.last7}
          icon={<Clock className="h-3.5 w-3.5 text-tribe-green-dark" />}
        />
        <Tile
          label={t('tileUncontacted')}
          value={page.tiles.uncontacted}
          icon={<Inbox className="h-3.5 w-3.5 text-orange-500" />}
        />
        <Tile
          label={t('tileTotal')}
          value={page.tiles.total}
          icon={<Users className="h-3.5 w-3.5 text-tribe-green-dark" />}
        />
      </div>

      {/* Loading is its own branch rather than an empty table. "Todavía no hay
          leads" while the read is still in flight is a wrong answer, not a slow
          one, and it is the one a gym owner would act on by assuming the pass
          is broken. */}
      {loading && page.rows.length === 0 ? (
        <div className="h-16 rounded-xl bg-theme-inset animate-pulse" />
      ) : (
        <LeadsTable rows={page.rows} togglingId={togglingId} onToggleContacted={onToggleContacted} />
      )}

      {/* The range is shown whenever there is anything to count, even on a
          single page: "1-6 de 6" is what tells a gym the list is complete. The
          buttons only appear once there is somewhere to go, because a pair of
          permanently disabled controls on a six-row list is furniture. */}
      {page.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-theme-tertiary">{t('range', { from, to, total: page.total })}</p>
          {(hasPrev || hasNext) && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev || loading}
                className="rounded-lg border border-theme px-3 py-2 text-sm font-medium text-theme-primary disabled:opacity-40"
              >
                {t('prev')}
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext || loading}
                className="rounded-lg border border-theme px-3 py-2 text-sm font-medium text-theme-primary disabled:opacity-40"
              >
                {t('next')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
