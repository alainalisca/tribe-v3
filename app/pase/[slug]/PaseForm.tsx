'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The pass form and, after a successful claim, the pass itself.
 *
 * Replaces itself in place rather than navigating: the person is standing in a
 * gym on a phone, and a navigation here costs a round trip and a chance to lose
 * them on a slow connection.
 */

interface PaseFormProps {
  slug: string;
  partnerName: string;
  options: Record<string, string[]>;
  consentText: string;
  consentPolicyPath: string;
}

interface ClaimedPass {
  passCode: string;
  whatsappUrl: string | null;
  storefrontUrl: string | null;
  email: string;
}

type FieldErrors = Partial<Record<'name' | 'whatsapp' | 'email', string>>;

/**
 * Survives a refresh.
 *
 * Without this, someone who pulls to refresh on their pass gets an empty form
 * and fills it in again. That is a duplicate lead for Leo to untangle, and the
 * person thinks the first attempt failed. Keyed by slug so two passes do not
 * overwrite each other. sessionStorage rather than localStorage: the pass
 * belongs to this visit, and it is already in their email.
 */
function storageKey(slug: string): string {
  return `tribe:pase:${slug}`;
}

function readStoredPass(slug: string): ClaimedPass | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimedPass;
    return parsed?.passCode ? parsed : null;
  } catch {
    // Private mode, blocked site data, or a bad JSON blob. The form is the
    // correct fallback, so this is not worth surfacing.
    return null;
  }
}

function storePass(slug: string, pass: ClaimedPass): void {
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(pass));
  } catch {
    // Not being able to remember it is a worse refresh experience, not a
    // failure: the claim already succeeded and the email is already sent.
  }
}

export default function PaseForm({ slug, partnerName, options, consentText, consentPolicyPath }: PaseFormProps) {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimed, setClaimed] = useState<ClaimedPass | null>(null);

  /** Set once on mount; the server rejects anything under two seconds. */
  const mountedAt = useRef<number>(0);
  const attribution = useRef<{ src: string | null; code: string | null }>({ src: null, code: null });

  const groups = useMemo(() => Object.entries(options).slice(0, 2), [options]);

  useEffect(() => {
    mountedAt.current = Date.now();
    const params = new URLSearchParams(window.location.search);
    // Sent as typed. The server sanitizes and drops anything malformed to
    // null rather than rejecting the lead over a typo on a poster.
    attribution.current = { src: params.get('src'), code: params.get('code') };
    setClaimed(readStoredPass(slug));
  }, [slug]);

  function validate(): boolean {
    const errors: FieldErrors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      errors.name = 'Escribe tu nombre completo.';
    }
    // Deliberately loose: the server normalizes and is the authority. This only
    // catches an obviously empty or too-short entry before a round trip.
    if (whatsapp.replace(/\D/g, '').length < 10) {
      errors.whatsapp = 'Escribe tu número de WhatsApp, con 10 dígitos.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Escribe un correo válido.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const form = event.currentTarget;
      const honeypot = (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';
      const [group1, group2] = groups;

      const response = await fetch('/api/pase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name: name.trim(),
          whatsapp,
          email: email.trim(),
          choice_1: group1 ? (choices[group1[0]] ?? null) : null,
          choice_2: group2 ? (choices[group2[0]] ?? null) : null,
          src: attribution.current.src,
          code: attribution.current.code,
          consent,
          website: honeypot,
          t: mountedAt.current,
        }),
      });

      if (!response.ok) {
        // One banner for every server-side rejection. The route answers
        // generically on purpose, so echoing its reason would add nothing and
        // inventing a specific one would be a guess.
        setBanner(
          response.status === 429
            ? 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
            : 'No pudimos procesar tu solicitud. Revisa tus datos e intenta de nuevo.'
        );
        return;
      }

      const data = (await response.json()) as {
        pass_code: string;
        whatsapp_url: string | null;
        storefront_url: string | null;
      };
      const pass: ClaimedPass = {
        passCode: data.pass_code,
        whatsappUrl: data.whatsapp_url,
        storefrontUrl: data.storefront_url,
        email: email.trim(),
      };
      storePass(slug, pass);
      setClaimed(pass);
    } catch {
      setBanner('No pudimos procesar tu solicitud. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (claimed) {
    return (
      <section className="rounded-2xl bg-white p-6" aria-live="polite">
        <p className="text-sm font-medium text-stone-600">Tu pase</p>
        <p className="mt-1 text-4xl font-extrabold tracking-widest text-tribe-dark">{claimed.passCode}</p>
        <p className="mt-2 text-sm text-stone-600">Muéstralo en recepción o menciónalo por WhatsApp.</p>

        {claimed.whatsappUrl ? (
          <a
            href={claimed.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block rounded-xl bg-tribe-dark px-5 py-4 text-center text-base font-semibold text-white"
          >
            Escríbele a {partnerName} por WhatsApp
          </a>
        ) : null}

        {claimed.storefrontUrl ? (
          <a
            href={claimed.storefrontUrl}
            className="mt-3 block rounded-xl border-2 border-tribe-dark px-5 py-4 text-center text-base font-semibold text-tribe-dark"
          >
            Reserva tu clase en Tribe
          </a>
        ) : null}

        <p className="mt-4 text-xs text-stone-500">También te enviamos el pase a {claimed.email}.</p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl bg-white p-6">
      {banner ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {banner}
        </div>
      ) : null}

      <Field label="Nombre" error={fieldErrors.name} htmlFor="pase-name">
        <input
          id="pase-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-tribe-dark"
        />
      </Field>

      <Field label="WhatsApp" error={fieldErrors.whatsapp} htmlFor="pase-whatsapp">
        <input
          id="pase-whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="300 123 4567"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-tribe-dark"
        />
      </Field>

      <Field label="Correo" error={fieldErrors.email} htmlFor="pase-email">
        <input
          id="pase-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base text-tribe-dark"
        />
      </Field>

      {groups.map(([label, values]) => (
        <fieldset key={label} className="mb-4">
          <legend className="mb-2 text-sm font-medium capitalize text-tribe-dark">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              const selected = choices[label] === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setChoices((prev) => ({ ...prev, [label]: value }))}
                  className={
                    'rounded-xl border-2 px-4 py-2 text-sm font-semibold ' +
                    // Green as a fill behind tribe-dark text, never as text on
                    // white: no green in the palette clears AA as small copy.
                    (selected
                      ? 'border-tribe-green bg-tribe-green text-tribe-dark'
                      : 'border-stone-300 text-tribe-dark')
                  }
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/*
        Honeypot. Offscreen rather than display:none or hidden: the naive bots
        this is aimed at skip fields they cannot see, and an absolutely
        positioned field is still "visible" to them while never reaching a real
        person. tabIndex -1 and aria-hidden keep it away from keyboard and
        screen-reader users, who would otherwise land in a field with no
        purpose and no label.
      */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        defaultValue=""
        className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
      />

      <label className="mt-2 flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="text-xs leading-relaxed text-stone-600">
          {consentText}{' '}
          <a
            href={consentPolicyPath}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-tribe-dark underline"
          >
            Política de tratamiento de datos
          </a>
        </span>
      </label>

      <button
        type="submit"
        disabled={!consent || submitting}
        className="mt-6 w-full rounded-xl bg-tribe-dark px-5 py-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Enviando...' : 'Reclamar mi pase'}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-tribe-dark">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
