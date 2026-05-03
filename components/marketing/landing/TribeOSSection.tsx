'use client';

import { useState, type FormEvent } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { showError } from '@/lib/toast';

interface FormState {
  name: string;
  email: string;
  whatTheyTeach: string;
  sessionsPerWeek: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  whatTheyTeach: '',
  sessionsPerWeek: '',
};

const t = {
  en: {
    eyebrow: 'Tribe OS — Coming Soon',
    headline: 'Run Your Fitness Business on Tribe',
    sub: 'Create paid sessions, manage clients, and grow your business — all in one platform.',
    features: [
      'Create and manage paid sessions',
      'Process payments automatically',
      'Track clients and revenue',
      'Grow your business',
    ],
    launchBadge: 'Launching Q2 2026',
    cardTitle: 'Join the Waitlist',
    cardSub: 'Get early access when we launch.',
    namePh: 'Your name',
    emailPh: 'your@email.com',
    teachPh: 'CrossFit, Yoga, BJJ, etc.',
    sessionsPh: 'Sessions per week',
    submit: 'Join Waitlist',
    submitting: 'Joining...',
    successTitle: "You're on the list!",
    successSub: "We'll email you when Tribe OS launches.",
    networkError: 'Network error. Please try again.',
  },
  es: {
    eyebrow: 'Tribe OS — Próximamente',
    headline: 'Lleva tu Negocio Fitness en Tribe',
    sub: 'Crea sesiones pagas, gestiona clientes y haz crecer tu negocio — todo en una sola plataforma.',
    features: [
      'Crea y gestiona sesiones pagas',
      'Procesa pagos automáticamente',
      'Sigue a tus clientes e ingresos',
      'Haz crecer tu negocio',
    ],
    launchBadge: 'Lanzamiento Q2 2026',
    cardTitle: 'Únete a la Lista',
    cardSub: 'Obtén acceso anticipado cuando lancemos.',
    namePh: 'Tu nombre',
    emailPh: 'tu@correo.com',
    teachPh: 'CrossFit, Yoga, BJJ, etc.',
    sessionsPh: 'Sesiones por semana',
    submit: 'Únete a la Lista',
    submitting: 'Enviando...',
    successTitle: '¡Estás en la lista!',
    successSub: 'Te avisaremos por correo cuando Tribe OS lance.',
    networkError: 'Error de red. Intenta de nuevo.',
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
      {/* Subtle radial accent — matches hero treatment */}
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
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10 lg:gap-12 items-center">
          {/* Left column */}
          <div>
            <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-5">
              {s.headline}
            </h2>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-8">{s.sub}</p>

            <ul className="space-y-3 mb-8">
              {s.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-tribe-green/20 flex items-center justify-center shrink-0">
                    <span className="text-tribe-green text-xs font-bold">✓</span>
                  </span>
                  <span className="text-base text-white/90">{feature}</span>
                </li>
              ))}
            </ul>

            <span className="inline-block px-4 py-2 rounded-full bg-tribe-green text-tribe-dark text-sm font-bold">
              {s.launchBadge}
            </span>
          </div>

          {/* Right column — waitlist card */}
          <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            {!success ? (
              <>
                <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-2">{s.cardTitle}</h3>
                <p className="text-sm text-gray-500 mb-6">{s.cardSub}</p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder={s.namePh}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    disabled={submitting}
                    maxLength={255}
                    className="w-full px-4 py-3 text-base rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
                  />
                  <input
                    type="email"
                    placeholder={s.emailPh}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    disabled={submitting}
                    maxLength={255}
                    className="w-full px-4 py-3 text-base rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
                  />
                  <input
                    type="text"
                    placeholder={s.teachPh}
                    value={form.whatTheyTeach}
                    onChange={(e) => setForm({ ...form, whatTheyTeach: e.target.value })}
                    required
                    disabled={submitting}
                    maxLength={255}
                    className="w-full px-4 py-3 text-base rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
                  />
                  <input
                    type="number"
                    placeholder={s.sessionsPh}
                    value={form.sessionsPerWeek}
                    onChange={(e) => setForm({ ...form, sessionsPerWeek: e.target.value })}
                    min={0}
                    max={1000}
                    disabled={submitting}
                    className="w-full px-4 py-3 text-base rounded-lg border-2 border-gray-200 focus:border-tribe-green focus:outline-none transition disabled:opacity-60"
                  />

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
                  <span className="text-white text-2xl font-black">✓</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-2">{s.successTitle}</h3>
                <p className="text-sm text-gray-500">{s.successSub}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
