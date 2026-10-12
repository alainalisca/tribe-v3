'use client';

/**
 * T-PLAN1 part C: the /planes page body. White, clean, gym photos over Tribe
 * branding. No upsell popups: this page is reached by a link only.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCoachPlanPrice, type CoachPlan, type PaidCoachPlan } from '@/lib/subscription/coachPlans';
import { planesCopy, type PlanCopy } from './planesCopy';

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
  if (!res.ok || typeof url !== 'string') {
    const err =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : 'error';
    throw new Error(err);
  }
  return url;
}

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

  const priceLabel = (amount: number | null) =>
    amount === null ? c.priceUnavailable : `${formatCoachPlanPrice(amount, prices.currency)} ${c.perMonth}`;

  const whatsappHref = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(
        language === 'es'
          ? 'Hola Al, quiero saber más de Tribe Crecimiento.'
          : 'Hi Al, I would like to know more about Tribe Crecimiento.'
      )}`
    : null;

  const column = (key: CoachPlan & ('basico' | PaidCoachPlan), copy: PlanCopy, price: string, founding: boolean) => {
    // Embajador has no column of its own; the comp banner above says so.
    const isCurrent = currentPlan === key;
    return (
      <div
        key={key}
        className={`flex flex-col rounded-2xl border p-6 bg-white ${isCurrent ? 'border-tribe-green ring-2 ring-tribe-green' : 'border-slate-200'}`}
      >
        <div className="flex items-center justify-between gap-2 min-h-6">
          {founding && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-900 bg-tribe-green rounded-full px-2 py-0.5">
              {c.founding}
            </span>
          )}
          {isCurrent && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-tribe-green">{c.currentPlan}</span>
          )}
        </div>
        <h2 className="mt-3 text-xl font-extrabold text-slate-900">{copy.name}</h2>
        <p className="text-sm text-slate-500">{copy.priceNote}</p>
        <p className="mt-4 text-2xl font-extrabold text-slate-900">{price}</p>
        <ul className="mt-5 space-y-2 flex-1">
          {copy.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-slate-700">
              <Check className="w-4 h-4 mt-0.5 text-tribe-green flex-shrink-0" aria-hidden="true" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-2">
          {key === 'basico' ? (
            <Link
              href={viewer.signedIn ? '/create/' : `/auth/?returnTo=${encodeURIComponent('/create/')}`}
              className="block w-full text-center rounded-xl border border-slate-300 py-3 font-semibold text-slate-900 hover:border-slate-900 transition"
            >
              {copy.cta}
            </Link>
          ) : isCurrent && viewer.signedIn && viewer.canManage ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={busy !== null}
              className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-60"
            >
              {busy === 'portal' ? c.working : c.manage}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startCheckout(key)}
              disabled={busy !== null || (viewer.signedIn && viewer.active)}
              className="w-full rounded-xl bg-tribe-green py-3 font-semibold text-slate-900 disabled:opacity-60"
            >
              {busy === key ? c.working : copy.cta}
            </button>
          )}
          {key === 'crecimiento' && whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center rounded-xl border border-slate-300 py-3 font-semibold text-slate-900 hover:border-slate-900 transition"
            >
              {c.talkToAl}
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" aria-label="Tribe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tribe-wordmark-dark.png" alt="Tribe" className="h-7 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          {language === 'es' ? 'EN' : 'ES'}
        </button>
      </header>

      <section className="max-w-5xl mx-auto px-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl overflow-hidden h-36 sm:h-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing-deadlift.jpg" alt="" className="w-full h-full object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing-rowers.jpg" alt="" className="w-full h-full object-cover" />
        </div>
        <h1 className="mt-6 text-3xl sm:text-4xl font-extrabold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">{c.subtitle}</p>

        {banner && <p className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm">{banner}</p>}
        {viewer.signedIn && viewer.comped && (
          <p className="mt-4 rounded-xl bg-slate-50 border border-tribe-green p-3 text-sm">
            {c.compBanner(
              viewer.plan === 'embajador'
                ? c.embajador
                : planesCopy[language][viewer.plan === 'crecimiento' ? 'crecimiento' : 'pro'].name
            )}
          </p>
        )}
        {notice && (
          <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
            {notice}
            {notice === c.instructorsOnly && (
              <Link href="/onboarding/role/" className="ml-2 font-semibold underline">
                {c.becomeInstructor}
              </Link>
            )}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {column('basico', c.basico, c.free, false)}
          {column('pro', c.pro, priceLabel(prices.pro), true)}
          {column('crecimiento', c.crecimiento, priceLabel(prices.crecimiento), true)}
        </div>

        <p className="mt-8 mb-12 text-center text-sm text-slate-500">{c.footer}</p>
      </section>
    </main>
  );
}
