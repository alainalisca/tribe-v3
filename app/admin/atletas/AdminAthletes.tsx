'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AdminPartnerOption, AdminProgram } from '@/lib/dal/athleteAdmin';
import type { GymView } from '@/lib/atletas/gymView';
import GymSummary from '@/app/atletas/gym/[partnerId]/GymSummary';
import GymAthletes from '@/app/atletas/gym/[partnerId]/GymAthletes';
import GymGuests from '@/app/atletas/gym/[partnerId]/GymGuests';

/**
 * T-AV27b /admin/atletas/, the client half. Every program, with the gym
 * dashboard's own pieces (GymSummary, GymAthletes, GymGuests) rendered from
 * the admin's view of the summary, plus what only staff do:
 *   Crear programa       POST /api/admin/atletas { action: 'create' }
 *   Programa activo      POST /api/admin/atletas { action: 'set_active' }
 *   Marcar como patrocinado  av_athletes_set_level, admin-only in the database
 * "Patrocinado" is allowed on this screen only (D7, Al 2026-10-01).
 */
export interface AdminProgramView extends AdminProgram {
  view: GymView | null;
}

interface AdminAthletesProps {
  programs: AdminProgramView[];
  partnersWithoutProgram: AdminPartnerOption[];
}

async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/atletas/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (error: unknown) {
    console.error('[AdminAthletes] request failed', error);
    return false;
  }
}

function ProgramCard({ p }: { p: AdminProgramView }) {
  const t = useTranslations('admin');
  const tg = useTranslations('gym');
  const td = useTranslations('door');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    setFailed(false);
    const ok = await post({ action: 'set_active', partnerId: p.partnerId, active: next });
    setBusy(false);
    if (ok) router.refresh();
    else setFailed(true);
  }

  return (
    <section
      className="space-y-3 rounded-2xl bg-theme-card p-4"
      data-admin-program={p.partnerId}
      data-active={p.isActive}
    >
      <div className="flex items-center justify-between gap-3">
        <Link href={`/atletas/gym/${p.partnerId}/`} className="truncate text-lg font-bold text-theme-primary underline">
          {p.partnerName}
        </Link>
        <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-theme-primary">
          <input
            type="checkbox"
            checked={p.isActive}
            disabled={busy}
            data-action="set-active"
            onChange={(e) => void toggle(e.target.checked)}
            className="h-5 w-5 accent-tribe-dark"
          />
          {t('active')}
        </label>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          {td('error')}
        </p>
      ) : null}
      {p.view ? (
        <>
          <GymSummary view={p.view} />
          <GymAthletes view={p.view} canSponsor />
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-theme-primary">{tg('tabGuests')}</summary>
            <div className="mt-3">
              <GymGuests view={p.view} />
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

export default function AdminAthletes({ programs, partnersWithoutProgram }: AdminAthletesProps) {
  const t = useTranslations('admin');
  const td = useTranslations('door');
  const router = useRouter();
  const [partnerId, setPartnerId] = useState('');
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!partnerId || creating) return;
    setCreating(true);
    setFailed(false);
    const ok = await post({ action: 'create', partnerId });
    setCreating(false);
    if (ok) {
      setPartnerId('');
      router.refresh();
    } else setFailed(true);
  }

  return (
    <div className="min-h-screen bg-theme-page">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-lg font-bold text-theme-primary">{t('title')}</h1>
        </div>
      </div>
      <div className="pt-header max-w-2xl mx-auto px-4 pb-10 space-y-4">
        <form onSubmit={create} className="mt-4 space-y-2 rounded-2xl bg-theme-card p-4" data-admin-create>
          <label className="block text-sm font-semibold text-theme-primary" htmlFor="admin-partner">
            {t('partner')}
          </label>
          <select
            id="admin-partner"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base text-tribe-dark"
          >
            <option value="" />
            {partnersWithoutProgram.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!partnerId || creating}
            className="w-full rounded-xl bg-tribe-green px-4 py-3 text-base font-bold text-tribe-dark disabled:opacity-50"
          >
            {t('create')}
          </button>
          {failed ? (
            <p role="alert" className="text-sm text-red-700">
              {td('error')}
            </p>
          ) : null}
        </form>

        {programs.length === 0 ? (
          <p className="rounded-2xl bg-theme-card p-4 text-sm text-theme-secondary">{t('empty')}</p>
        ) : (
          programs.map((p) => <ProgramCard key={p.partnerId} p={p} />)
        )}
      </div>
    </div>
  );
}
