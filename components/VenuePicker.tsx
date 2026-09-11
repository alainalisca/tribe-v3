'use client';

/**
 * Choosing a gym or studio as a session's venue (T-GYM2).
 *
 * Presentation only. The RPC call, the returned status, the failure message and
 * the clearing path all live in useVenuePicker, so create and edit share one
 * implementation instead of a copy each (Al, 2026-09-11).
 *
 * Not a map picker: the gym's address comes from its partner row, and the free
 * text location flow is untouched. An instructor who is not at a gym never
 * interacts with this.
 *
 * Any active partner can be chosen, not only the instructor's own gyms. The
 * database decides what that means -- a roster member at a gym with
 * auto-approve on publishes at once, anyone else lands pending -- and the copy
 * below tells them which they got, in the gym's own words rather than a status
 * label.
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, X, Check, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchGymsAndStudios, type GymIdentity } from '@/lib/dal/gymVenue';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';
import type { VenueStatus } from '@/hooks/useVenuePicker';

interface VenuePickerProps {
  selected: GymIdentity | null;
  onSelect: (gym: GymIdentity | null) => void;
  /** The database's verdict, once the session has been saved. */
  status?: VenueStatus;
  /** True when the session saved but the link did not. */
  failed?: boolean;
  disabled?: boolean;
}

export default function VenuePicker({ selected, onSelect, status, failed, disabled }: VenuePickerProps) {
  const t = useTranslations('create');
  const tPartner = useTranslations('partner');
  const [gyms, setGyms] = useState<GymIdentity[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchGymsAndStudios(createClient());
      if (cancelled) return;
      if (!result.success || !result.data) {
        // A failure here costs the picker its list and nothing else: the
        // session still saves, with a free-text location.
        logError(new Error(result.error ?? 'venues_unavailable'), { action: 'VenuePicker.load' });
        return;
      }
      setGyms(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return gyms;
    return gyms.filter((g) => g.business_name.toLowerCase().includes(term));
  }, [gyms, search]);

  // Nothing to choose from: render nothing rather than an empty control that
  // looks broken. True today for every athlete, since one gym partner exists.
  if (gyms.length === 0 && !selected) return null;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-theme-primary">{t('whereIsSession')}</label>

      {selected ? (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-theme bg-theme-card">
          <span className="w-8 h-8 rounded-md bg-tribe-dark text-tribe-green text-[11px] font-bold flex items-center justify-center flex-shrink-0">
            {selected.business_name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? '')
              .join('')}
          </span>
          <span className="flex-1 min-w-0 text-sm font-semibold text-theme-primary truncate">
            {selected.business_name}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={disabled}
            aria-label={t('otherPlace')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-theme-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-theme bg-theme-card text-sm text-theme-secondary"
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            {t('searchGyms')}
          </button>

          {open && (
            <div className="rounded-xl border border-theme bg-theme-card overflow-hidden">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchGyms')}
                aria-label={t('searchGyms')}
                className="w-full px-3 py-2 bg-transparent text-sm text-theme-primary border-b border-theme outline-none"
              />
              <ul className="max-h-56 overflow-y-auto">
                {matches.length === 0 && <li className="px-3 py-3 text-sm text-theme-tertiary">{t('noGymsFound')}</li>}
                {matches.map((gym) => (
                  <li key={gym.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(gym);
                        setOpen(false);
                        setSearch('');
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-theme-primary flex items-center gap-2"
                    >
                      <span className="w-6 h-6 rounded-md bg-tribe-dark text-tribe-green text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        {gym.business_name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? '')
                          .join('')}
                      </span>
                      <span className="truncate">{gym.business_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* What the database decided, said plainly rather than as a status word. */}
      {selected && status === 'pending' && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {t('partnerNeedsApproval', { gym: selected.business_name })}
        </p>
      )}
      {selected && status === 'approved' && (
        <p className="flex items-center gap-1.5 text-xs text-tribe-green-dark">
          <Check className="w-3.5 h-3.5 flex-shrink-0" />
          {t('venueApproved', { gym: selected.business_name })}
        </p>
      )}
      {failed && <p className="text-xs text-tribe-red">{t('venueLinkFailed')}</p>}
      {selected && !status && !failed && (
        <p className="text-xs text-theme-tertiary">{tPartner('venueRequestsHelp', { gym: selected.business_name })}</p>
      )}
    </div>
  );
}
