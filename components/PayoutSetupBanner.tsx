'use client';

/**
 * PayoutSetupBanner — nudges an instructor to set up how they get paid.
 *
 * Why this exists: the payout-connection page (/earnings/payout-settings) is
 * reachable but buried, so instructors sign up and never connect a payout
 * method — which means clients have no way to actually pay them. This card
 * surfaces a clear "set up payouts" CTA on the instructor dashboard until a
 * real payout method (Wompi / Stripe) is selected.
 *
 * Hidden when: the user is not an instructor, or has already chosen a real
 * payout method (payout_method is 'wompi' or 'stripe_connect'). The 'manual'
 * default and null are treated as "not set up yet".
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Wallet } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { fetchMyBillingProfile } from '@/lib/dal';

const CONFIGURED_METHODS = new Set(['wompi', 'stripe_connect']);

export default function PayoutSetupBanner() {
  const { language } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // is_instructor stays on users; payout_method is no longer client-readable
      // (migration 113) so it comes from the self-scoped billing RPC.
      const { data, error } = await supabase
        .from('users')
        .select('is_instructor')
        .eq('id', user.id)
        .single();
      if (cancelled || error || !data?.is_instructor) return;
      const billing = await fetchMyBillingProfile(supabase);
      if (cancelled || !billing.success) return;
      const needsSetup = !CONFIGURED_METHODS.has(billing.data?.payout_method ?? '');
      setShow(needsSetup);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const copy =
    language === 'es'
      ? {
          title: 'Configura cómo recibir pagos',
          desc: 'Conecta tu cuenta de pago para que tus clientes puedan pagarte por las sesiones.',
          cta: 'Configurar pagos',
        }
      : {
          title: 'Set up how you get paid',
          desc: 'Connect your payout account so clients can pay you for your sessions.',
          cta: 'Set up payouts',
        };

  return (
    <Link
      href="/earnings/payout-settings"
      className="group mt-4 flex items-center gap-3 w-full px-4 py-3 rounded-2xl bg-tribe-green/10 border border-tribe-green/40 hover:bg-tribe-green/20 transition"
    >
      <div className="w-10 h-10 rounded-xl bg-tribe-green/20 flex items-center justify-center shrink-0">
        <Wallet className="w-5 h-5 text-tribe-green" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-theme-primary">{copy.title}</p>
        <p className="text-xs text-theme-secondary">{copy.desc}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-bold text-tribe-green shrink-0 transition-transform group-hover:translate-x-0.5">
        {copy.cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
