'use client';

/**
 * Tribe.OS waitlist capture card.
 *
 * Extracted verbatim from TribeOSSection so the same form can serve every
 * surface that used to offer Subscribe. Tribe.OS billing is off until launch
 * (see the TRIBE_OS_BILLING_ENABLED gate on
 * /api/tribe-os/subscription/checkout), so the product collects intent instead
 * of money.
 *
 * Copy stays a prop rather than being read from messages/*.json here: the
 * landing page passes the marketing strings it already owns, which keeps the
 * anonymous-visitor experience byte-identical to before the extraction. The
 * dashboard passes its own copy from messages/*.json. Consolidating the two
 * into one source is worth doing, but not inside a ticket scoped to disarming
 * checkout.
 */

import { useState, type FormEvent } from 'react';
import { showError } from '@/lib/toast';

export type PricingPreference = 'monthly_30' | 'revenue_share_15';

interface FormState {
  name: string;
  email: string;
  whatTheyTeach: string;
  sessionsPerWeek: string;
  pricingPreference: PricingPreference | '';
  comments: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  whatTheyTeach: '',
  sessionsPerWeek: '',
  pricingPreference: '',
  comments: '',
};

export interface WaitlistCardCopy {
  cardTitle: string;
  cardSub: string;
  nameLabel: string;
  emailLabel: string;
  teachLabel: string;
  teachPh: string;
  sessionsLabel: string;
  sessionsPh: string;
  pricingHeading: string;
  pricingMonthly: string;
  pricingRevShare: string;
  commentsLabel: string;
  commentsPh: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successSub: string;
  pricingMissing: string;
  networkError: string;
}

export default function TribeOSWaitlistCard({ copy: s, language }: { copy: WaitlistCardCopy; language: 'en' | 'es' }) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    if (form.pricingPreference === '') {
      setErrorMsg(s.pricingMissing);
      showError(s.pricingMissing);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      // Trailing slash is required (next.config has trailingSlash: true).
      const res = await fetch('/api/tribe-os-waitlist/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          whatTheyTeach: form.whatTheyTeach,
          sessionsPerWeek: form.sessionsPerWeek === '' ? null : Number(form.sessionsPerWeek),
          pricingPreference: form.pricingPreference,
          comments: form.comments.trim() === '' ? null : form.comments.trim(),
          language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        const msg = data.error || s.networkError;
        setErrorMsg(msg);
        showError(msg);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
    } catch {
      setErrorMsg(s.networkError);
      showError(s.networkError);
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-tribe-green flex items-center justify-center">
          <span className="text-tribe-dark text-2xl font-black">✓</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-3">{s.successTitle}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{s.successSub}</p>
      </div>
    );
  }

  return (
    <>
      <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-2">{s.cardTitle}</h3>
      <p className="text-sm text-gray-600 mb-6 leading-relaxed">{s.cardSub}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-tribe-dark">
          {s.nameLabel}
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            disabled={submitting}
            maxLength={255}
            className="w-full px-4 py-3 text-base font-normal rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-tribe-dark">
          {s.emailLabel}
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            disabled={submitting}
            maxLength={255}
            className="w-full px-4 py-3 text-base font-normal rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-tribe-dark">
          {s.teachLabel}
          <input
            type="text"
            placeholder={s.teachPh}
            value={form.whatTheyTeach}
            onChange={(e) => setForm({ ...form, whatTheyTeach: e.target.value })}
            required
            disabled={submitting}
            maxLength={255}
            className="w-full px-4 py-3 text-base font-normal rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-tribe-dark">
          {s.sessionsLabel}
          <input
            type="number"
            placeholder={s.sessionsPh}
            value={form.sessionsPerWeek}
            onChange={(e) => setForm({ ...form, sessionsPerWeek: e.target.value })}
            min={0}
            max={1000}
            disabled={submitting}
            className="w-full px-4 py-3 text-base font-normal rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
          />
        </label>

        <fieldset className="flex flex-col gap-2 mt-1" disabled={submitting}>
          <legend className="text-sm font-semibold text-tribe-dark mb-2">{s.pricingHeading}</legend>
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${form.pricingPreference === 'monthly_30' ? 'border-tribe-green bg-tribe-green/5' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <input
              type="radio"
              name="pricingPreference"
              value="monthly_30"
              checked={form.pricingPreference === 'monthly_30'}
              onChange={() => setForm({ ...form, pricingPreference: 'monthly_30' })}
              required
              className="mt-1 accent-tribe-green"
            />
            <span className="text-sm text-tribe-dark leading-snug">{s.pricingMonthly}</span>
          </label>
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${form.pricingPreference === 'revenue_share_15' ? 'border-tribe-green bg-tribe-green/5' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <input
              type="radio"
              name="pricingPreference"
              value="revenue_share_15"
              checked={form.pricingPreference === 'revenue_share_15'}
              onChange={() => setForm({ ...form, pricingPreference: 'revenue_share_15' })}
              className="mt-1 accent-tribe-green"
            />
            <span className="text-sm text-tribe-dark leading-snug">{s.pricingRevShare}</span>
          </label>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-tribe-dark">
          {s.commentsLabel}
          <textarea
            placeholder={s.commentsPh}
            value={form.comments}
            onChange={(e) => setForm({ ...form, comments: e.target.value })}
            disabled={submitting}
            maxLength={2000}
            rows={3}
            className="w-full px-4 py-3 text-base font-normal rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60 resize-y"
          />
        </label>

        {errorMsg && (
          <p className="text-sm text-red-600" role="alert">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full px-6 py-3.5 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
        >
          {submitting ? s.submitting : s.submit}
        </button>
      </form>
    </>
  );
}
