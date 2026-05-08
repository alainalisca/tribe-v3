'use client';

import { useState, type FormEvent } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { showError } from '@/lib/toast';

type PricingPreference = 'monthly_30' | 'revenue_share_15';

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

// English copy is the canonical source. Spanish strings below are starter-pack
// drafts pending Verónica's review; once she returns edits, replace the `es`
// block and remove the marker comment.
const t = {
  en: {
    eyebrow: 'Tribe.OS',
    headline: 'Run your fitness business inside Tribe.',
    sub: 'Tribe.OS is the premium tier for instructors and group leaders. Charge for your sessions, manage your clients, and grow your practice without leaving the app your community already uses.',
    reasonsHeading: 'Why instructors are joining',
    reasons: [
      {
        title: 'Charge for what you teach.',
        body: 'Take payments through Tribe with one tap from the participant. No second app, no separate sign-in.',
      },
      {
        title: 'Keep your client list in one place.',
        body: 'The people who show up to your free sessions today become your client base. Tribe.OS keeps them organized.',
      },
      {
        title: 'Grow beyond your WhatsApp group.',
        body: 'Every session you post reaches participants you have not met yet, in your sport, at your level, near you.',
      },
    ],
    cardTitle: 'Join the Tribe.OS waitlist',
    cardSub:
      'Tell us about your work and the pricing model that would work for you. We will reach out as we open early access.',
    nameLabel: 'Your name',
    emailLabel: 'Email',
    teachLabel: 'What do you teach?',
    teachPh: 'Yoga, running, boxing, dance, BJJ',
    sessionsLabel: 'How many sessions do you run per week?',
    sessionsPh: 'For example, 5',
    pricingHeading: 'Which pricing model would work for you?',
    pricingMonthly: 'Thirty dollars per month for unlimited paid session creation.',
    pricingRevShare: 'Free to use. Tribe takes fifteen percent of paid session revenue.',
    commentsLabel: 'Anything else we should know?',
    commentsPh: 'Optional. Tell us about your practice, your clients, and what would help most.',
    submit: 'Join the waitlist',
    submitting: 'Saving your entry',
    successTitle: 'Thanks. You are on the list.',
    successSub:
      'We will reach out as Tribe.OS opens for early access. In the meantime, keep using the free Tribe app. Every session you post reaches participants you have not met yet.',
    pricingMissing: 'Pick the pricing model that works for you.',
    networkError: 'Something went wrong on our side. Please try again.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    eyebrow: 'Tribe.OS',
    headline: 'Gestiona tu negocio de fitness dentro de Tribe.',
    sub: 'Tribe.OS es el plan premium para instructores y líderes de grupo. Cobra por tus sesiones, gestiona a tus clientes y haz crecer tu práctica sin salir de la aplicación que tu comunidad ya usa.',
    reasonsHeading: 'Por qué los instructores se están uniendo',
    reasons: [
      {
        title: 'Cobra por lo que enseñas.',
        body: 'Recibe pagos a través de Tribe con un toque por parte del participante. Sin una segunda aplicación y sin un inicio de sesión separado.',
      },
      {
        title: 'Mantén tu lista de clientes en un solo lugar.',
        body: 'Las personas que asisten a tus sesiones gratuitas hoy se convierten en tu base de clientes. Tribe.OS los mantiene organizados.',
      },
      {
        title: 'Crece más allá de tu grupo de WhatsApp.',
        body: 'Cada sesión que publicas llega a participantes que aún no conoces, en tu deporte, en tu nivel, cerca de ti.',
      },
    ],
    cardTitle: 'Únete a la lista de espera de Tribe.OS',
    cardSub:
      'Cuéntanos sobre tu trabajo y el modelo de precios que funcionaría para ti. Te contactaremos cuando abramos el acceso anticipado.',
    nameLabel: 'Tu nombre',
    emailLabel: 'Correo electrónico',
    teachLabel: '¿Qué enseñas?',
    teachPh: 'Yoga, running, boxeo, baile, BJJ',
    sessionsLabel: '¿Cuántas sesiones realizas por semana?',
    sessionsPh: 'Por ejemplo, 5',
    pricingHeading: '¿Qué modelo de precios funcionaría para ti?',
    pricingMonthly: 'Treinta dólares al mes por la creación ilimitada de sesiones de pago.',
    pricingRevShare: 'Gratis de usar. Tribe toma el quince por ciento de los ingresos de las sesiones de pago.',
    commentsLabel: '¿Algo más que debamos saber?',
    commentsPh: 'Opcional. Cuéntanos sobre tu práctica, tus clientes y qué te ayudaría más.',
    submit: 'Únete a la lista de espera',
    submitting: 'Guardando tu entrada',
    successTitle: 'Gracias. Estás en la lista.',
    successSub:
      'Te contactaremos cuando Tribe.OS abra el acceso anticipado. Mientras tanto, sigue usando la aplicación Tribe gratuita. Cada sesión que publicas llega a participantes que aún no conoces.',
    pricingMissing: 'Elige el modelo de precios que funciona para ti.',
    networkError: 'Algo salió mal de nuestro lado. Por favor intenta de nuevo.',
  },
} as const;

export default function TribeOSSection() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal(0.1);

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
      // Without it the request hits a 308 → which browsers follow but it adds
      // an extra round trip and historically caused issues with POST bodies.
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

  return (
    <section id="tribe-os" className="relative py-24 px-4 overflow-hidden bg-tribe-dark">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(132,204,22,0.08) 0%, transparent 70%)' }}
        />
      </div>

      <div
        ref={ref}
        className={`relative z-10 max-w-6xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10 lg:gap-12 items-start">
          {/* Left column — pitch */}
          <div>
            <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-5">
              {s.headline}
            </h2>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-8">{s.sub}</p>

            <h3 className="text-tribe-green uppercase tracking-[0.1em] text-xs font-semibold mb-4">
              {s.reasonsHeading}
            </h3>
            <ul className="space-y-5">
              {s.reasons.map((reason) => (
                <li key={reason.title} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-tribe-green shrink-0" />
                  <div>
                    <p className="text-base font-bold text-white mb-1">{reason.title}</p>
                    <p className="text-sm text-white/80 leading-relaxed">{reason.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right column — waitlist card */}
          <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            {!success ? (
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
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-tribe-green flex items-center justify-center">
                  <span className="text-tribe-dark text-2xl font-black">✓</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-3">{s.successTitle}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{s.successSub}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
