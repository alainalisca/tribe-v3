'use client';

/**
 * T-PLAN1 part C: /planes. Mobile-first (coaches open it on their phone from a
 * WhatsApp link), white, Spanish first, one real coach mid-class as the hero.
 * No upsell popups anywhere: this page is reached by a link only.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import type { CoachPlan, PaidCoachPlan } from '@/lib/subscription/coachPlans';
import { planesCopy } from './planesCopy';
import PlanCard, { type PlanCardAction } from './PlanCard';
import Reveal from './Reveal';
import { PlanesFaq, PlanesHero, PlanesProof, PlanesSteps } from './PlanesSections';

export type PlanesViewer =
  | { signedIn: false }
  | { signedIn: true; isInstructor: boolean; plan: CoachPlan; active: boolean; comped: boolean; canManage: boolean };

interface PlanesClientProps {
  viewer: PlanesViewer;
  prices: { pro: number | null; crecimiento: number | null; currency: string };
  whatsappDigits: string | null;
}

async function postForUrl(path: string, body?: object): Promise<string> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await res.json().catch(() => null);
  const url = typeof json === 'object' && json !== null && 'url' in json ? (json as { url: unknown }).url : null;
  if (!res.ok || typeof url !== 'string') throw new Error('request_failed');
  return url;
}

const amountLabel = (amount: number | null) =>
  amount === null ? null : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount);

export default function PlanesClient({ viewer, prices, whatsappDigits }: PlanesClientProps) {
  const { language, setLanguage } = useLanguage();
  const c = planesCopy[language];
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<PaidCoachPlan | 'portal' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const checkoutParam = params.get('checkout');
  const currentPlan: CoachPlan = viewer.signedIn ? viewer.plan : 'basico';

  async function startCheckout(plan: PaidCoachPlan) {
    if (!viewer.signedIn) {
      router.push(`/auth/?returnTo=${encodeURIComponent(`/planes/?checkout=${plan}`)}`);
      return;
    }
    if (!viewer.isInstructor) {
      setNotice(c.instructorsOnly);
      return;
    }
    setBusy(plan);
    setNotice(null);
    try {
      window.location.href = await postForUrl('/api/coach-plans/checkout/', { plan });
    } catch {
      setNotice(c.errorGeneric);
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal');
    setNotice(null);
    try {
      window.location.href = await postForUrl('/api/coach-plans/portal/');
    } catch {
      setNotice(c.errorGeneric);
      setBusy(null);
    }
  }

  // Back from sign-in with ?checkout=pro: carry on to Stripe once.
  useEffect(() => {
    if (autoStarted.current || !viewer.signedIn || viewer.active) return;
    if (checkoutParam === 'pro' || checkoutParam === 'crecimiento') {
      autoStarted.current = true;
      void startCheckout(checkoutParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the arrival param
  }, [checkoutParam]);

  // Back from Stripe: the webhook usually lands within seconds; refresh once.
  useEffect(() => {
    if (checkoutParam !== 'success') return;
    const timer = setTimeout(() => router.refresh(), 4000);
    return () => clearTimeout(timer);
  }, [checkoutParam, router]);

  const banner = checkoutParam === 'success' ? c.successBanner : checkoutParam === 'canceled' ? c.canceledBanner : null;
  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(c.whatsappText)}`
    : null;

  const paidAction = (plan: PaidCoachPlan): PlanCardAction => {
    if (viewer.signedIn && currentPlan === plan && viewer.canManage) {
      return { kind: 'manage', onClick: openPortal, disabled: busy !== null, busy: busy === 'portal' };
    }
    return {
      kind: 'checkout',
      onClick: () => void startCheckout(plan),
      disabled: busy !== null || (viewer.signedIn && viewer.active),
      busy: busy === plan,
    };
  };

  return (
    <div className="min-h-screen bg-white text-tribe-dark">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          aria-label="Tribe"
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-tribe-green"
        >
          {/* The real wordmark file, dark variant for a white page. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tribe-wordmark-dark.png" alt="Tribe" width={1709} height={564} className="h-7 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
          className="rounded-full border border-tribe-dark-60 px-3 py-1 text-sm font-bold text-tribe-dark-80 transition hover:border-tribe-dark hover:text-tribe-dark"
        >
          {language === 'es' ? 'EN' : 'ES'}
        </button>
      </header>

      <main>
        {(banner || notice || (viewer.signedIn && viewer.comped)) && (
          <div className="max-w-6xl mx-auto px-4 space-y-3 pb-4">
            {banner && <p className="rounded-2xl bg-tribe-dark-40 p-4 text-sm font-semibold">{banner}</p>}
            {viewer.signedIn && viewer.comped && (
              <p className="rounded-2xl bg-tribe-green/20 p-4 text-sm font-semibold">
                {c.compBanner(
                  viewer.plan === 'embajador'
                    ? c.embajador
                    : c[viewer.plan === 'crecimiento' ? 'crecimiento' : 'pro'].name
                )}
              </p>
            )}
            {notice && (
              <div role="alert" className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
                {notice}
                {notice === c.instructorsOnly && (
                  <Link href="/onboarding/role/" className="ml-2 font-bold underline">
                    {c.becomeInstructor}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        <PlanesHero c={c} />
        <PlanesProof c={c} />

        <section id="planes" className="scroll-mt-4 bg-tribe-dark-40 py-14">
          <div className="max-w-6xl mx-auto px-4">
            <Reveal>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{c.plansTitle}</h2>
              <p className="mt-2 text-tribe-dark-80">{c.plansSub}</p>
            </Reveal>
            {/* Mobile: Coach Pro first (the recommended choice), then Crecimiento,
                then Básico. Desktop: Básico | Coach Pro | Crecimiento. */}
            <div className="mt-8 grid gap-5 md:grid-cols-3 md:items-stretch">
              <Reveal className="order-3 md:order-1">
                <PlanCard
                  copy={c.basico}
                  c={c}
                  amount={null}
                  isCurrent={viewer.signedIn && currentPlan === 'basico'}
                  action={{
                    kind: 'link',
                    href: viewer.signedIn ? '/create/' : `/auth/?returnTo=${encodeURIComponent('/create/')}`,
                  }}
                  className="h-full"
                />
              </Reveal>
              <Reveal className="order-1 md:order-2" delayMs={80}>
                <PlanCard
                  copy={c.pro}
                  c={c}
                  amount={amountLabel(prices.pro)}
                  recommended
                  founding
                  isCurrent={currentPlan === 'pro'}
                  action={paidAction('pro')}
                  className="h-full md:-my-3"
                />
              </Reveal>
              <Reveal className="order-2 md:order-3" delayMs={160}>
                <PlanCard
                  copy={c.crecimiento}
                  c={c}
                  amount={amountLabel(prices.crecimiento)}
                  founding
                  isCurrent={currentPlan === 'crecimiento'}
                  action={paidAction('crecimiento')}
                  className="h-full"
                />
              </Reveal>
            </div>
            {prices.pro === null && <p className="mt-4 text-sm text-tribe-dark-80">{c.priceUnavailable}</p>}
          </div>
        </section>

        <PlanesSteps c={c} />
        <PlanesFaq c={c} whatsappHref={whatsappHref} />
      </main>

      <footer className="border-t border-tribe-dark-60/50 py-8 text-center text-sm text-tribe-dark-80 px-4">
        {c.footer}
      </footer>
    </div>
  );
}
