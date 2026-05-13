'use client';

/**
 * /os/gym — gym settings.
 *
 * Displays the gym's display name, slug (read-only — slug is the
 * URL fragment, regenerating it would break shared links), timezone,
 * and default currency. The owner can edit name / timezone / currency
 * inline. Non-owner coaches see the same fields read-only.
 *
 * Stripe-related fields (customer / subscription IDs) intentionally
 * not shown — those live in the Stripe Customer Portal.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';
import type { GymRow } from '@/lib/dal/gyms';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no_gym' }
  | { kind: 'ready'; gym: GymRow; canEdit: boolean };

// Common IANA timezones for the LATAM + US market. A more complete
// picker can land later if needed; this covers the gyms we expect
// to onboard during beta.
const TIMEZONE_OPTIONS = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/Buenos_Aires',
  'America/Caracas',
  'America/Sao_Paulo',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'UTC',
] as const;

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    backLabel: 'Back to dashboard',
    title: 'Gym settings',
    subtitle: 'How your gym shows up across Tribe.OS.',
    loading: 'Loading',
    error: 'Could not load gym settings.',
    retry: 'Retry',
    redirectingLabel: 'Redirecting',
    noGymTitle: 'No gym yet',
    noGymHint:
      'A gym is created automatically when you subscribe to Tribe.OS premium. If you see this message, something is off — reach out and we will fix it.',
    nameLabel: 'Gym name',
    namePlaceholder: 'e.g. Studio Cabra',
    nameHint: 'Shown in client-facing emails and on shared session pages.',
    slugLabel: 'Slug',
    slugHint: 'Read-only. Used in URLs and shared links; regenerating it would break links you have already shared.',
    timezoneLabel: 'Timezone',
    timezoneHint: 'Revenue dashboard bucketing and at-risk windows use this zone.',
    currencyLabel: 'Default currency',
    currencyHint: 'Which currency the revenue dashboard leads with when both USD and COP have activity.',
    currencyNoDefault: 'Auto (pick based on activity)',
    notificationsSection: 'Notifications',
    intelligenceEmailLabel: 'Email me when AI flags new at-risk members',
    intelligenceEmailHint:
      'The nightly intelligence engine sends a digest of the alerts it generated. Turn this off if you’d rather check the dashboard manually.',
    save: 'Save changes',
    saving: 'Saving',
    saveSuccess: 'Gym settings updated.',
    genericError: 'Something went wrong. Please try again.',
    readOnlyNotice: 'Only the gym owner can edit these settings.',
  },
  es: {
    backLabel: 'Volver al panel',
    title: 'Configuración del gym',
    subtitle: 'Cómo aparece tu gym en Tribe.OS.',
    loading: 'Cargando',
    error: 'No se pudo cargar la configuración del gym.',
    retry: 'Reintentar',
    redirectingLabel: 'Redirigiendo',
    noGymTitle: 'Aún sin gym',
    noGymHint:
      'Se crea un gym automáticamente al suscribirte a Tribe.OS premium. Si ves este mensaje, algo está raro — escríbenos y lo arreglamos.',
    nameLabel: 'Nombre del gym',
    namePlaceholder: 'p. ej. Studio Cabra',
    nameHint: 'Aparece en correos a clientes y en páginas compartidas de sesiones.',
    slugLabel: 'Identificador',
    slugHint:
      'Solo lectura. Se usa en URLs y enlaces compartidos; regenerarlo rompería los enlaces que ya hayas compartido.',
    timezoneLabel: 'Zona horaria',
    timezoneHint: 'El panel de ingresos y las ventanas de seguimiento usan esta zona.',
    currencyLabel: 'Moneda predeterminada',
    currencyHint: 'Con cuál moneda inicia el panel cuando hay actividad en USD y COP.',
    currencyNoDefault: 'Automática (según la actividad)',
    notificationsSection: 'Notificaciones',
    intelligenceEmailLabel: 'Avísame cuando la IA marque nuevos miembros en riesgo',
    intelligenceEmailHint:
      'El análisis nocturno envía un resumen de las alertas generadas. Desactívalo si prefieres revisar el panel manualmente.',
    save: 'Guardar cambios',
    saving: 'Guardando',
    saveSuccess: 'Configuración del gym actualizada.',
    genericError: 'Algo salió mal. Por favor intenta de nuevo.',
    readOnlyNotice: 'Solo el propietario del gym puede editar estos ajustes.',
  },
} as const;

export default function GymSettingsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        // Need to know the caller's auth.uid() to determine owner-only edit access.
        const supabaseClient = createClient();
        const { data: authData } = await supabaseClient.auth.getUser();
        const callerId = authData.user?.id ?? null;

        const res = await fetch('/api/tribe-os/gym/', { method: 'GET' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'no_gym' });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: GymRow;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.error });
          return;
        }
        const canEdit = !!callerId && body.data.owner_user_id === callerId;
        setState({ kind: 'ready', gym: body.data, canEdit });
        trackEvent('tribe_os_gym_settings_viewed', { can_edit: canEdit });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, reloadKey, s.error]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-600 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loading}…
        </p>
      </main>
    );
  }

  return (
    <main className="text-gray-900 px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-tribe-green/20 text-tribe-green flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{s.title}</h1>
            <p className="text-sm text-gray-600 mt-1">{s.subtitle}</p>
          </div>
        </header>

        {state.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-gray-500">{s.loading}…</p>
        ) : state.kind === 'no_gym' ? (
          <div className="py-12 text-center space-y-3">
            <h2 className="text-lg font-bold">{s.noGymTitle}</h2>
            <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">{s.noGymHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              {s.retry}
            </button>
          </div>
        ) : (
          <GymForm
            initialGym={state.gym}
            canEdit={state.canEdit}
            copy={s}
            onSaved={() => {
              setReloadKey((k) => k + 1);
              router.refresh();
            }}
          />
        )}
      </div>
    </main>
  );
}

function GymForm({
  initialGym,
  canEdit,
  copy: s,
  onSaved,
}: {
  initialGym: GymRow;
  canEdit: boolean;
  copy: typeof copy.en | typeof copy.es;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialGym.name);
  const [timezone, setTimezone] = useState(initialGym.timezone);
  const [currency, setCurrency] = useState<'USD' | 'COP' | ''>(initialGym.default_currency ?? '');
  const [intelligenceEmailEnabled, setIntelligenceEmailEnabled] = useState(initialGym.intelligence_email_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || !canEdit) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: Record<string, unknown> = {};
      if (name.trim() !== initialGym.name) payload.name = name.trim();
      if (timezone !== initialGym.timezone) payload.timezone = timezone;
      const normalizedCurrency = currency === '' ? null : currency;
      if (normalizedCurrency !== initialGym.default_currency) payload.default_currency = normalizedCurrency;
      if (intelligenceEmailEnabled !== initialGym.intelligence_email_enabled) {
        payload.intelligence_email_enabled = intelligenceEmailEnabled;
      }

      if (Object.keys(payload).length === 0) {
        setSuccess(s.saveSuccess);
        setSaving(false);
        return;
      }

      const res = await fetch('/api/tribe-os/gym/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: GymRow;
        error?: string;
      };
      if (!res.ok || !body.success) {
        setError(body.error || s.genericError);
        setSaving(false);
        return;
      }
      setSuccess(s.saveSuccess);
      setSaving(false);
      trackEvent('tribe_os_gym_settings_saved', {
        // Which fields changed — coarse aggregation, no values
        changed_name: 'name' in payload,
        changed_timezone: 'timezone' in payload,
        changed_currency: 'default_currency' in payload,
        changed_intelligence_email: 'intelligence_email_enabled' in payload,
      });
      onSaved();
    } catch {
      setError(s.genericError);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!canEdit ? (
        <div
          className="flex items-start gap-2 p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-700"
          role="status"
        >
          <AlertCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
          <span>{s.readOnlyNotice}</span>
        </div>
      ) : null}

      <Field label={s.nameLabel} hint={s.nameHint}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={s.namePlaceholder}
          maxLength={255}
          required
          disabled={!canEdit || saving}
          className="w-full px-4 py-2.5 bg-white text-gray-900 placeholder:text-gray-400 text-sm rounded-lg border border-gray-200 focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
        />
      </Field>

      <Field label={s.slugLabel} hint={s.slugHint}>
        <input
          type="text"
          value={initialGym.slug}
          readOnly
          disabled
          className="w-full px-4 py-2.5 bg-gray-100 text-gray-600 text-sm rounded-lg border border-gray-200 font-mono"
        />
      </Field>

      <Field label={s.timezoneLabel} hint={s.timezoneHint}>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={!canEdit || saving}
          className="w-full px-4 py-2.5 bg-white text-gray-900 text-sm rounded-lg border border-gray-200 focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
        >
          {/* Render the current value first in case it's outside our common list */}
          {!TIMEZONE_OPTIONS.includes(timezone as (typeof TIMEZONE_OPTIONS)[number]) ? (
            <option value={timezone}>{timezone}</option>
          ) : null}
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </Field>

      <Field label={s.currencyLabel} hint={s.currencyHint}>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as 'USD' | 'COP' | '')}
          disabled={!canEdit || saving}
          className="w-full px-4 py-2.5 bg-white text-gray-900 text-sm rounded-lg border border-gray-200 focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
        >
          <option value="">{s.currencyNoDefault}</option>
          <option value="USD">USD</option>
          <option value="COP">COP</option>
        </select>
      </Field>

      {/* Notifications section — currently a single toggle, but kept
          in its own header so it scales when we add more preferences
          (per-coach digest opt-in, weekly summary, push, etc.). */}
      <div className="pt-2">
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">
          {s.notificationsSection}
        </h2>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={intelligenceEmailEnabled}
            onChange={(e) => setIntelligenceEmailEnabled(e.target.checked)}
            disabled={!canEdit || saving}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-tribe-green focus:ring-tribe-green disabled:opacity-60"
          />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-gray-900 group-hover:text-tribe-dark">
              {s.intelligenceEmailLabel}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">{s.intelligenceEmailHint}</span>
          </span>
        </label>
      </div>

      {error ? (
        <div
          className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-gray-900"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-tribe-red shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div
          className="flex items-start gap-2 p-3 bg-tribe-green/10 border border-tribe-green/30 rounded-lg text-sm text-gray-900"
          role="status"
        >
          <span>{success}</span>
        </div>
      ) : null}

      {canEdit ? (
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center px-6 py-3 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:transform-none"
        >
          {saving ? `${s.saving}…` : s.save}
        </button>
      ) : null}
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-gray-900 mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-gray-500 mt-1">{hint}</span> : null}
    </label>
  );
}
