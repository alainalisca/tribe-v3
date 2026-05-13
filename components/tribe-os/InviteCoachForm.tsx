'use client';

/**
 * Inline form for adding a coach to the caller's gym. Owner-only —
 * the parent /os/coaches page hides this form for non-owners.
 *
 * Two fields: email (required) + role (defaults to 'coach', with
 * 'assistant' as the other option). On submit, POSTs to
 * /api/tribe-os/coaches/invite. The endpoint distinguishes between
 * "user not on Tribe yet" (so we can show a friendly message
 * pointing them to ask the invitee to sign up) and other errors.
 *
 * Success calls `onInvited` so the parent can refresh the roster.
 */

import { useState, type FormEvent } from 'react';
import { UserPlus, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

type Role = 'coach' | 'assistant';

interface InviteCoachFormProps {
  /** Called after a successful invite so the parent refreshes the roster. */
  onInvited?: () => void;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    openCta: 'Add a coach',
    closeCta: 'Cancel',
    emailLabel: 'Email',
    emailPlaceholder: 'coach@gym.com',
    roleLabel: 'Role',
    roleCoach: 'Coach',
    roleAssistant: 'Assistant',
    submit: 'Add',
    submitting: 'Adding',
    successTitle: 'Coach added',
    errorTitle: 'Could not add coach',
    notOnTribe: "That email isn't on Tribe yet. Ask them to sign up at tribe-v3.vercel.app first, then try again.",
    cannotInviteSelf: "You're already the gym owner.",
    ownerOnly: 'Only the gym owner can add coaches.',
    genericError: 'Something went wrong. Please try again.',
  },
  es: {
    openCta: 'Agregar entrenador',
    closeCta: 'Cancelar',
    emailLabel: 'Correo',
    emailPlaceholder: 'entrenador@gym.com',
    roleLabel: 'Rol',
    roleCoach: 'Entrenador',
    roleAssistant: 'Asistente',
    submit: 'Agregar',
    submitting: 'Agregando',
    successTitle: 'Entrenador agregado',
    errorTitle: 'No se pudo agregar al entrenador',
    notOnTribe:
      'Ese correo aún no está en Tribe. Pídele que se registre en tribe-v3.vercel.app primero, luego intenta de nuevo.',
    cannotInviteSelf: 'Ya eres el propietario del gym.',
    ownerOnly: 'Solo el propietario del gym puede agregar entrenadores.',
    genericError: 'Algo salió mal. Por favor intenta de nuevo.',
  },
} as const;

export default function InviteCoachForm({ onInvited }: InviteCoachFormProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('coach');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function translateError(code: string): string {
    switch (code) {
      case 'user_not_on_tribe':
        return s.notOnTribe;
      case 'cannot_invite_self':
        return s.cannotInviteSelf;
      case 'owner_only':
        return s.ownerOnly;
      default:
        return s.genericError;
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccess(null);

    setSubmitting(true);
    try {
      const res = await fetch('/api/tribe-os/coaches/invite/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { name?: string | null; email?: string | null };
        error?: string;
      };
      if (!res.ok || !body.success) {
        setError(translateError(body.error ?? 'unknown'));
        setSubmitting(false);
        return;
      }
      const inviteeLabel = body.data?.name || body.data?.email || email;
      setSuccess(`${s.successTitle}: ${inviteeLabel}`);
      setEmail('');
      setRole('coach');
      setSubmitting(false);
      onInvited?.();
    } catch {
      setError(s.genericError);
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-full shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all"
      >
        <UserPlus className="w-4 h-4" />
        {s.openCta}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">{s.openCta}</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setSuccess(null);
          }}
          aria-label={s.closeCta}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">{s.emailLabel}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={s.emailPlaceholder}
          autoComplete="email"
          maxLength={254}
          disabled={submitting}
          className="w-full px-3 py-2 bg-white text-gray-900 placeholder:text-gray-400 text-sm rounded-lg border border-gray-200 focus:border-tribe-green focus:outline-none disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">{s.roleLabel}</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={submitting}
          className="w-full px-3 py-2 bg-white text-gray-900 text-sm rounded-lg border border-gray-200 focus:border-tribe-green focus:outline-none disabled:opacity-60"
        >
          <option value="coach">{s.roleCoach}</option>
          <option value="assistant">{s.roleAssistant}</option>
        </select>
      </label>

      {error ? (
        <div
          className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-gray-900"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 text-tribe-red shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">{s.errorTitle}: </span>
            {error}
          </span>
        </div>
      ) : null}

      {success ? (
        <div
          className="flex items-start gap-2 p-2.5 bg-tribe-green/10 border border-tribe-green/40 rounded-lg text-xs text-gray-900"
          role="status"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-tribe-green shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="px-3 py-1.5 bg-white text-gray-600 text-xs font-semibold rounded-full border border-gray-200 hover:text-gray-900 transition-colors disabled:opacity-60"
        >
          {s.closeCta}
        </button>
        <button
          type="submit"
          disabled={submitting || email.trim().length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5"
        >
          {submitting ? `${s.submitting}…` : s.submit}
        </button>
      </div>
    </form>
  );
}
