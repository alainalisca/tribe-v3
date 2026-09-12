'use client';

/**
 * The way into the partner dashboard (T-GYM2).
 *
 * The approval queue shipped with no route to it: /dashboard/partner was
 * reachable only by typing the URL, which no gym owner will do. Follows the
 * Instructor Dashboard card directly above it in the profile page rather than
 * inventing a pattern.
 *
 * Renders nothing unless the signed-in account has a featured_partners row, so
 * an ordinary athlete or instructor never sees it -- the same auto-hide rule
 * MyCoachEntryCard uses.
 *
 * The badge carries the pending count, and disappears at zero: a gym with
 * nothing waiting should see a calm card, not a "0".
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchPartnerByUserId } from '@/lib/dal/featuredPartners';
import { fetchVenueRequests } from '@/lib/dal/venueRequests';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';

export default function PartnerDashboardEntryCard() {
  const [isPartner, setIsPartner] = useState(false);
  const [pending, setPending] = useState(0);
  const t = useTranslations('partner');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const partner = await fetchPartnerByUserId(supabase, user.id);
      if (cancelled) return;
      if (!partner.success || !partner.data) {
        // Not a partner, or the read failed. Either way the card stays hidden:
        // showing a dashboard link to someone who would be redirected back out
        // is worse than showing nothing.
        if (!partner.success) {
          logError(new Error(partner.error ?? 'partner_lookup_failed'), {
            action: 'PartnerDashboardEntryCard.load',
          });
        }
        return;
      }

      setIsPartner(true);
      const requests = await fetchVenueRequests(supabase, partner.data.id);
      if (cancelled) return;
      // A failed count costs the badge, not the link.
      if (requests.success && requests.data) setPending(requests.data.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isPartner) return null;

  return (
    <Link
      href="/dashboard/partner"
      className="mt-3 flex items-center justify-center gap-3 w-full px-5 py-5 bg-white dark:bg-tribe-surface rounded-2xl border border-tribe-mid text-tribe-gray-60 hover:border-tribe-green hover:text-tribe-green transition text-center"
    >
      <Building2 className="w-6 h-6 flex-shrink-0" />
      <span className="font-bold text-base text-center">{t('partnerDashboard')}</span>
      {pending > 0 && (
        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-tribe-green text-slate-900 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {pending}
        </span>
      )}
    </Link>
  );
}
