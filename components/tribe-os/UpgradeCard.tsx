'use client';

/**
 * Tribe.OS premium upgrade card.
 *
 * Shared between the marketing landing TribeOSSection (right column,
 * shown to signed-in non-premium visitors) and /os/dashboard (shown
 * to signed-in non-premium users who navigate to the dashboard before
 * subscribing).
 *
 * Pure UI: posts to /api/tribe-os/subscription/checkout/ and redirects
 * the browser to the Stripe-hosted Checkout URL it returns. The actual
 * subscription is created when the user completes payment, at which
 * point the customer.subscription.created webhook fires and syncs the
 * tribe_os_* columns. The Stripe success_url then brings them to
 * /os/dashboard?subscribed=true.
 */

import { useState } from 'react';
import { showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';

interface UpgradeCardCopy {
  upgradeTitle: string;
  upgradePrice: string;
  upgradePriceHint: string;
  upgradeBenefits: readonly string[];
  subscribeButton: string;
  subscribingLabel: string;
  subscribeError: string;
}

export default function UpgradeCard({ copy: s }: { copy: UpgradeCardCopy }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    trackEvent('tribe_os_checkout_started');
    try {
      const res = await fetch('/api/tribe-os/subscription/checkout/', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.success || !body.url) {
        const message = body.error || s.subscribeError;
        setError(message);
        showError(message);
        setSubmitting(false);
        return;
      }
      window.location.href = body.url;
      // Don't reset submitting — page is navigating away.
    } catch {
      setError(s.subscribeError);
      showError(s.subscribeError);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-2">{s.upgradeTitle}</h3>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl sm:text-4xl font-black text-tribe-dark">{s.upgradePrice}</span>
      </div>
      <p className="text-sm text-gray-600 mb-6">{s.upgradePriceHint}</p>

      <ul className="space-y-3 mb-6">
        {s.upgradeBenefits.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-tribe-dark leading-relaxed">
            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-tribe-green shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {error ? (
        <p className="text-sm text-red-600 mb-3" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={submitting}
        className="w-full px-6 py-3.5 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
      >
        {submitting ? `${s.subscribingLabel}…` : s.subscribeButton}
      </button>
    </div>
  );
}
