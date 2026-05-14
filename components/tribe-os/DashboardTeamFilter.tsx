'use client';

/**
 * DashboardTeamFilter — single team-scope selector that drives both
 * the at-risk and celebrate-wins widgets on /os/dashboard.
 *
 * Hidden entirely when the gym has zero teams (single-team gyms see
 * the full dashboard unchanged). Renders as a small inline picker
 * next to the audit chip on the dashboard header rail.
 *
 * Selection persists in localStorage so a multi-team coach's pick
 * survives across visits. The current value is communicated up to
 * the dashboard via the `onChange` callback.
 *
 * "All teams" is the implicit default. We don't auto-pick the first
 * team — the dashboard works fine without scoping, and forcing a
 * pick would surprise coaches who don't care about team filtering.
 */

import { useEffect, useState } from 'react';
import { Users2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';

const STORAGE_KEY = 'tribe_os_dashboard_team_filter';

interface Team {
  id: string;
  name: string;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    label: 'Team',
    allTeams: 'All teams',
  },
  es: {
    label: 'Equipo',
    allTeams: 'Todos los equipos',
  },
} as const;

interface Props {
  /**
   * Called with the selected team id, or null when "All teams" is
   * chosen. The dashboard threads this through to its team-aware
   * widgets.
   */
  onChange: (teamId: string | null) => void;
}

export default function DashboardTeamFilter({ onChange }: Props) {
  const { language } = useLanguage();
  const s = copy[language];
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch teams once on mount. Quietly fail closed (no teams → don't
  // render). Hydrate the persisted selection only when the team
  // still exists; otherwise reset (a team the user picked may have
  // been deleted since their last visit).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/teams/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: Array<{ id: string; name: string }>;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !Array.isArray(body.data)) {
          setTeams([]);
          return;
        }
        const list = body.data.map((t) => ({ id: t.id, name: t.name }));
        setTeams(list);

        if (typeof window !== 'undefined') {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          if (stored && list.some((t) => t.id === stored)) {
            setSelectedId(stored);
            onChange(stored);
          }
        }
      } catch {
        if (!cancelled) setTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onChange is intentionally not in deps — capturing it once at
    // mount is the right behavior (dashboard reuses the same handler).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string) {
    const value = next === '' ? null : next;
    setSelectedId(value);
    onChange(value);
    if (typeof window !== 'undefined') {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    trackEvent('tribe_os_dashboard_team_filter_changed', {
      to: value === null ? 'all_teams' : 'specific_team',
    });
  }

  // Hide entirely until we know whether teams exist, and on
  // single-team-or-fewer gyms (the picker is pointless when there's
  // only one bucket).
  if (teams === null) return null;
  if (teams.length < 2) return null;

  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700">
      <Users2 className="w-3.5 h-3.5 text-gray-500" />
      <span className="sr-only sm:not-sr-only">{s.label}:</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-white border border-gray-200 rounded-lg text-xs font-semibold px-2 py-1.5 focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
      >
        <option value="">{s.allTeams}</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
