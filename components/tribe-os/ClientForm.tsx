'use client';

/**
 * Shared form for creating and editing a Tribe.OS client.
 *
 * Used by /os/clients/new and /os/clients/[id]/edit. Keeps both pages
 * thin: each just wires the initial values and the submit handler. The
 * form owns its own field state, validation copy, and inline error
 * surface.
 *
 * Tags are entered as a comma-separated string. We split + trim +
 * dedupe on submit to produce a clean string[] for the API. This is
 * simpler and more keyboard-friendly than a chip widget; we can
 * upgrade later if needed.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export interface ClientFormValues {
  name: string;
  email: string;
  phone: string;
  notes: string;
  tags: string;
}

export interface ClientFormProps {
  /** Pre-populated values for edit; defaults to empty strings for create. */
  initialValues?: Partial<ClientFormValues>;
  /** Form heading. Bilingual handled by the parent. */
  title: string;
  /** Submit button label (e.g. "Create" / "Save"). */
  submitLabel: string;
  /**
   * Submit handler. Receives the cleaned-up values: trimmed strings,
   * tags split into an array. Returns either { success: true, ... } or
   * { success: false, error }. The form surfaces the error inline.
   */
  onSubmit: (cleaned: {
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    tags: string[];
  }) => Promise<{ success: true } | { success: false; error: string }>;
  /** Where the back arrow / cancel link points. */
  cancelHref: string;
}

const copy = {
  en: {
    nameLabel: 'Name',
    namePlaceholder: 'Required',
    emailLabel: 'Email',
    emailPlaceholder: 'Optional',
    phoneLabel: 'Phone',
    phonePlaceholder: 'Optional',
    tagsLabel: 'Tags',
    tagsHint: 'Comma-separated. Up to 10 tags, 30 characters each.',
    tagsPlaceholder: 'vip, lead, yoga',
    notesLabel: 'Notes',
    notesPlaceholder: 'Anything you want to remember about this client',
    cancel: 'Cancel',
    saving: 'Saving',
    nameRequired: 'Name is required.',
    genericError: 'Something went wrong. Please try again.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    nameLabel: 'Nombre',
    namePlaceholder: 'Obligatorio',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'Opcional',
    phoneLabel: 'Teléfono',
    phonePlaceholder: 'Opcional',
    tagsLabel: 'Etiquetas',
    tagsHint: 'Separadas por comas. Hasta 10 etiquetas, 30 caracteres cada una.',
    tagsPlaceholder: 'vip, prospecto, yoga',
    notesLabel: 'Notas',
    notesPlaceholder: 'Cualquier cosa que quieras recordar sobre este cliente',
    cancel: 'Cancelar',
    saving: 'Guardando',
    nameRequired: 'El nombre es obligatorio.',
    genericError: 'Algo salió mal. Por favor intenta de nuevo.',
  },
} as const;

function splitTags(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.split(',')) {
    const t = raw.trim();
    if (t.length === 0) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export default function ClientForm({ initialValues, title, submitLabel, onSubmit, cancelHref }: ClientFormProps) {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [phone, setPhone] = useState(initialValues?.phone ?? '');
  const [tags, setTags] = useState(initialValues?.tags ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError(s.nameRequired);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit({
        name: trimmedName,
        email: email.trim().length > 0 ? email.trim() : null,
        phone: phone.trim().length > 0 ? phone.trim() : null,
        notes: notes.trim().length > 0 ? notes.trim() : null,
        tags: splitTags(tags),
      });
      if (!result.success) {
        setError(result.error || s.genericError);
        setSubmitting(false);
        return;
      }
      // Caller handles navigation on success.
    } catch {
      setError(s.genericError);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-tribe-dark text-white px-4 pt-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {s.cancel}
        </button>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight mb-6">{title}</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label={s.nameLabel}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={s.namePlaceholder}
              maxLength={120}
              required
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
            />
          </Field>

          <Field label={s.emailLabel}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={s.emailPlaceholder}
              maxLength={254}
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
            />
          </Field>

          <Field label={s.phoneLabel}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={s.phonePlaceholder}
              maxLength={30}
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
            />
          </Field>

          <Field label={s.tagsLabel} hint={s.tagsHint}>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={s.tagsPlaceholder}
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60"
            />
          </Field>

          <Field label={s.notesLabel}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={s.notesPlaceholder}
              maxLength={2000}
              rows={4}
              disabled={submitting}
              className="w-full px-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors disabled:opacity-60 resize-y"
            />
          </Field>

          {error ? (
            <div
              className="flex items-start gap-2 p-3 bg-tribe-red/10 border border-tribe-red/30 rounded-lg text-sm text-white"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-tribe-red shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-6 py-3 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:transform-none"
            >
              {submitting ? `${s.saving}…` : submitLabel}
            </button>
            <Link
              href={cancelHref}
              className="inline-flex items-center justify-center px-6 py-3 bg-tribe-surface text-white text-sm font-bold rounded-lg hover:bg-tribe-mid transition-colors"
            >
              {s.cancel}
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-white mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-white/50 mt-1">{hint}</span> : null}
    </label>
  );
}
