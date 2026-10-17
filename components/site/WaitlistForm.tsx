'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight } from './icons';
import b from './base.module.css';
import f from './form.module.css';

/** Every visible string, already translated on the server. */
export type WaitlistLabels = {
  name: string;
  namePh: string;
  email: string;
  emailPh: string;
  role: string;
  roleCoach: string;
  roleGym: string;
  teach: string;
  teachPh: string;
  sessions: string;
  submit: string;
  sending: string;
  done: string;
  error: string;
};

/**
 * T-SITE1 Part E. The Tribe.OS waitlist, posting to /api/tribe-os-waitlist.
 * No prices on this page (spec), so no pricing preference is sent; the role
 * goes in `comments`. The API answers errors in the visitor's language.
 */
export default function WaitlistForm({ lang, labels }: { lang: 'es' | 'en'; labels: WaitlistLabels }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const sessions = String(data.get('sessions') ?? '').trim();
    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/tribe-os-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          whatTheyTeach: String(data.get('teach') ?? ''),
          sessionsPerWeek: sessions === '' ? null : Number(sessions),
          comments: `${labels.role}: ${String(data.get('role') ?? '')}`,
          language: lang,
        }),
      });
      if (res.ok) {
        setState('done');
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? labels.error);
      setState('idle');
    } catch {
      setError(labels.error);
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <p className={f.ok} role="status">
        {labels.done}
      </p>
    );
  }

  return (
    <form className={f.form} onSubmit={submit}>
      <label>
        {labels.name}
        <input name="name" type="text" required maxLength={200} autoComplete="name" placeholder={labels.namePh} />
      </label>
      <label>
        {labels.email}
        <input name="email" type="email" required maxLength={200} autoComplete="email" placeholder={labels.emailPh} />
      </label>
      <label>
        {labels.role}
        <select name="role" defaultValue={labels.roleCoach}>
          <option>{labels.roleCoach}</option>
          <option>{labels.roleGym}</option>
        </select>
      </label>
      <label>
        {labels.teach}
        <input name="teach" type="text" required maxLength={200} placeholder={labels.teachPh} />
      </label>
      <label>
        {labels.sessions}
        <input name="sessions" type="number" inputMode="numeric" min={0} max={200} />
      </label>
      {error && (
        <p className={f.error} role="alert">
          {error}
        </p>
      )}
      <button className={`${b.cta} ${f.submit}`} type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? labels.sending : labels.submit} <ArrowRight />
      </button>
    </form>
  );
}
