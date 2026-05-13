'use client';

/**
 * TribeOSQuickAccess — fast switcher to /os/dashboard for premium users.
 *
 * Mounted next to NotificationBell in the home-page header. Visible
 * only when the signed-in user has an active Tribe.OS premium
 * subscription. For everyone else (anonymous, signed-in non-premium)
 * the component renders nothing — the marketing / upgrade pitch
 * already lives further down the page on /profile + /settings, so we
 * don't need a redundant header CTA.
 *
 * Why it lives here vs. in the existing TribeOSEntryCard:
 * EntryCard is the contextual "you're premium — here's what to do
 * next" surface (full card with status copy + CTA), which is right
 * for the profile / settings surface. This button is for the active
 * user who's flipping between the consumer app and Tribe.OS many
 * times a day. The two are companions, not replacements.
 *
 * Premium check: one Supabase round-trip on mount, cached for the
 * component's lifetime. The user's subscription state doesn't change
 * mid-session, so this is fine. If it ever does (e.g. real-time
 * Stripe webhook flips status while the user is browsing), the next
 * page navigation re-fetches.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';
import { useLanguage } from '@/lib/LanguageContext';

type PremiumProbe = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;
type State = 'loading' | 'hidden' | 'active';

export default function TribeOSQuickAccess() {
  const { language } = useLanguage();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState('hidden');
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        setState('hidden');
        return;
      }
      setState(isTribeOSPremiumActive(data as PremiumProbe | null) ? 'active' : 'hidden');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state holds a 40×40 spacer so the header layout doesn't
  // jump when the premium check resolves. Same dimensions as
  // NotificationBell so the visual rhythm stays consistent.
  if (state === 'loading') {
    return <div className="w-10 h-10" aria-hidden="true" />;
  }
  if (state !== 'active') return null;

  const label = language === 'es' ? 'Abrir Tribe.OS' : 'Open Tribe.OS';
  return (
    <Link
      href="/os/dashboard"
      aria-label={label}
      title={label}
      className="relative w-10 h-10 flex items-center justify-center rounded-full bg-tribe-green/20 hover:bg-tribe-green/30 transition-colors"
    >
      <Briefcase className="w-5 h-5 text-tribe-green-dark" />
      {/* Small lime dot in the corner to reinforce that this is the
          "active premium" entry point. Looks intentional even when
          the user's eye doesn't recognize the briefcase glyph. */}
      <span
        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-tribe-green ring-2 ring-stone-200 dark:ring-tribe-dark"
        aria-hidden="true"
      />
    </Link>
  );
}
