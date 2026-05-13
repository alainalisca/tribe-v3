'use client';

/**
 * TrainingPartnersSection — surfaces the top training partners for a
 * single client on /os/clients/[id].
 *
 * Pulls /api/tribe-os/clients/[id]/partners which reads the
 * training_partners edges (populated by the attendance trigger from
 * migration 076). Each row shows the partner's name, lifetime shared
 * session count, and a "last trained together" relative date.
 *
 * Clicking a partner navigates into their detail page so the coach
 * can chain follow-ups: "Anna is at risk → she trains with Carlos and
 * Maria — when did Carlos last show up?"
 *
 * Failure mode: when the API errors or returns zero edges the section
 * hides itself entirely. We only render when there's something useful
 * to show — an empty "no partners yet" card on every brand-new
 * client's detail page would just be noise.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatShortDate } from '@/lib/format/currency';
import type { TrainingPartner } from '@/lib/dal/trainingPartners';

type SectionState = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'ready'; partners: TrainingPartner[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Trains often with',
    hint: 'Members this client has shown up alongside the most. Strong partners are a retention signal — if one drops off, the others often follow.',
    sharedSessions: (n: number) => (n === 1 ? '1 session together' : `${n} sessions together`),
    lastTogether: (date: string) => `Last together ${date}`,
  },
  es: {
    title: 'Entrena con',
    hint: 'Miembros con los que más ha coincidido en sesiones. Las parejas fuertes son una señal de retención — si una abandona, las otras suelen seguir.',
    sharedSessions: (n: number) => (n === 1 ? '1 sesión juntos' : `${n} sesiones juntos`),
    lastTogether: (date: string) => `Última vez ${date}`,
  },
} as const;

function initialsFromName(name: string): string {
  // Two-letter avatar fallback. Skip blanks (defensive — name can be
  // empty if the join hid a row), default to "?" so the chip still
  // renders at a stable width.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TrainingPartnersSection({ clientId }: { clientId: string }) {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<SectionState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients/${clientId}/partners`, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { partners: TrainingPartner[] };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'hidden' });
          return;
        }
        const partners = body.data.partners;
        if (partners.length === 0) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'ready', partners });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (state.kind !== 'ready') return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-tribe-green-dark" />
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.title}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.hint}</p>
      <ul className="space-y-2">
        {state.partners.map((p) => (
          <li key={p.partner_id}>
            <Link
              href={`/os/clients/${p.partner_id}`}
              className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <span className="w-9 h-9 rounded-full bg-tribe-green-50 text-tribe-green-dark text-xs font-bold flex items-center justify-center shrink-0 group-hover:bg-tribe-green/20 transition-colors">
                {initialsFromName(p.partner_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-tribe-green-dark transition-colors">
                  {p.partner_name || '—'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {s.sharedSessions(p.shared_sessions)}
                  {' · '}
                  {s.lastTogether(formatShortDate(p.last_shared_at, language))}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
