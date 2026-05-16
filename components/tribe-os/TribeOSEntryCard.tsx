'use client';

/**
 * Surface entry point for Tribe.OS from the rest of the Tribe app.
 *
 * Why this exists
 * ---------------
 * Pre-shell, the only path from a signed-in user's normal Tribe
 * experience to /os/dashboard was the marketing landing page —
 * which signed-in users don't visit because they land on the feed.
 * The OS pages were effectively undiscoverable from inside the app.
 *
 * This card is the bridge. Drop it anywhere a user might decide
 * "OK, I want to manage my instructor business" — the Profile page,
 * the legacy Instructor Dashboard, settings, etc.
 *
 * Three rendered states based on the user's Tribe.OS premium status:
 *
 *   - probing: skeleton placeholder (one paint), avoids flashing
 *     the wrong CTA at premium users
 *   - active:  green CTA "Open Tribe.OS dashboard" → /os/dashboard
 *   - inactive: secondary CTA "Try Tribe.OS" → /os/dashboard
 *               (which shows the upgrade card to non-premium users)
 *
 * The destination is the same in both cases — `/os/dashboard` is
 * the natural landing page for either premium users (see the
 * dashboard) or non-premium users (see the upgrade card). The
 * difference is just the visual + copy of the entry CTA.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, Briefcase } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';

type PremiumProbe = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;
type ProbeState = 'probing' | 'active' | 'inactive';

interface TribeOSEntryCardProps {
  /**
   * Variant of the card. 'full' shows the rich card with icon and
   * description (Profile page); 'inline' shows a compact one-row
   * version (Instructor Dashboard, Settings list).
   */
  variant?: 'full' | 'inline';
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    activeTitle: 'Tribe.OS active',
    activeDescription: 'Manage your clients, attendance, and revenue.',
    activeCta: 'Open dashboard',
    inactiveTitle: 'Try Tribe.OS',
    inactiveDescription: 'For instructors. Manage clients, take payments, track revenue. First 90 days free.',
    inactiveCta: 'Learn more',
  },
  es: {
    activeTitle: 'Tribe.OS activo',
    activeDescription: 'Gestiona tus clientes, asistencias e ingresos.',
    activeCta: 'Abrir panel',
    inactiveTitle: 'Prueba Tribe.OS',
    inactiveDescription:
      'Para instructores. Gestiona clientes, recibe pagos, sigue tus ingresos. Primeros 90 días gratis.',
    inactiveCta: 'Aprender más',
  },
} as const;

export default function TribeOSEntryCard({ variant = 'full' }: TribeOSEntryCardProps) {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<ProbeState>('probing');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState('inactive');
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        setState('inactive');
        return;
      }
      setState(isTribeOSPremiumActive(data as PremiumProbe | null) ? 'active' : 'inactive');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Skeleton during the probe. Single paint; the card fills in once
  // the status resolves. Cheaper than flashing the "Try Tribe.OS"
  // CTA at an active premium user.
  if (state === 'probing') {
    return (
      <div
        aria-hidden="true"
        className={
          variant === 'inline'
            ? 'h-14 bg-tribe-mid/30 rounded-2xl animate-pulse'
            : 'h-24 bg-tribe-mid/30 rounded-2xl animate-pulse'
        }
      />
    );
  }

  const active = state === 'active';
  const title = active ? s.activeTitle : s.inactiveTitle;
  const description = active ? s.activeDescription : s.inactiveDescription;
  const cta = active ? s.activeCta : s.inactiveCta;
  const Icon = active ? Briefcase : Sparkles;

  if (variant === 'inline') {
    // Compact one-row variant. Used by the legacy Instructor
    // Dashboard and the Settings list.
    return (
      <Link
        href="/os/dashboard"
        className={`group flex items-center gap-3 w-full px-4 py-3 rounded-2xl transition ${
          active
            ? 'bg-tribe-green/10 border border-tribe-green/40 hover:bg-tribe-green/20'
            : 'bg-white dark:bg-tribe-surface border border-tribe-mid hover:border-tribe-green'
        }`}
      >
        <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-tribe-green' : 'text-theme-secondary'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${active ? 'text-tribe-green' : 'text-theme-primary'}`}>{title}</p>
          <p className="text-xs text-theme-secondary truncate">{description}</p>
        </div>
        <ArrowRight
          className={`w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
            active ? 'text-tribe-green' : 'text-theme-secondary'
          }`}
        />
      </Link>
    );
  }

  // Full variant — used on the Profile page. Visually distinct
  // enough to be noticed in a stack of CTAs but doesn't dominate.
  return (
    <Link
      href="/os/dashboard"
      className={`group flex items-center gap-3 w-full px-5 py-5 rounded-2xl transition ${
        active
          ? 'bg-gradient-to-br from-tribe-green/15 to-tribe-green/5 border border-tribe-green/50 hover:border-tribe-green'
          : 'bg-white dark:bg-tribe-surface border border-tribe-mid hover:border-tribe-green hover:text-tribe-green'
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          active ? 'bg-tribe-green text-tribe-dark' : 'bg-tribe-green/10 text-tribe-green'
        }`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-base font-bold ${active ? 'text-tribe-green' : 'text-theme-primary'}`}>{title}</p>
          {active ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-tribe-green text-tribe-dark">
              ON
            </span>
          ) : null}
        </div>
        <p className="text-xs text-theme-secondary mt-0.5 leading-relaxed">{description}</p>
      </div>
      <span
        className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 transition-transform group-hover:translate-x-0.5 ${
          active ? 'text-tribe-green' : 'text-tribe-green'
        }`}
      >
        {cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
