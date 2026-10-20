'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLanguage } from '@/lib/LanguageContext';
import { translateSport } from '@/lib/translations';
import { SPORTS_LIST } from '@/lib/sports';
import { bogotaToday } from '@/lib/time/bogotaDate';
import { DateTimeInput } from '@/components/ui/date-time-input';

/** T-MOM1: the "Registrar sesión pasada" form. On success it goes straight to the photo upload. */
export default function PastSessionForm({
  isAdmin,
  isInstructor,
  coaches,
}: {
  isAdmin: boolean;
  isInstructor: boolean;
  coaches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('moments');
  const { language } = useLanguage();
  const router = useRouter();
  const today = bogotaToday();
  const [form, setForm] = useState({
    hostId: isInstructor ? '' : (coaches[0]?.id ?? ''),
    sport: '',
    title: '',
    date: today,
    startTime: '18:00',
    duration: 60,
    location: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/moments/past-session/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hostId: form.hostId || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok || !body.id) throw new Error('failed');
      router.push(`/session/${body.id}/fotos/subir/`);
    } catch {
      setError(t('errorGeneric'));
      setSaving(false);
    }
  }

  const field =
    'mt-1 w-full rounded-xl border-[1.5px] border-stone-300 bg-white px-3 py-2.5 text-[15px] dark:bg-tribe-card';
  const label = 'block text-xs font-bold uppercase tracking-[0.04em] text-stone-600';

  return (
    <div className="min-h-screen bg-[#F7F8F6] dark:bg-tribe-mid">
      <header className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
        <Link href="/create" aria-label={t('back')} className="-ml-2 p-2">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-extrabold">{t('pastTitle')}</h1>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4 px-4 pb-10">
        <p className="text-sm text-stone-600">{t('pastIntro')}</p>
        {isAdmin && (
          <label className={label}>
            {t('pastHost')}
            <select value={form.hostId} onChange={(e) => set('hostId', e.target.value)} className={field}>
              {isInstructor && <option value="">{t('pastHostMe')}</option>}
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          {t('pastSport')}
          <select required value={form.sport} onChange={(e) => set('sport', e.target.value)} className={field}>
            <option value="" disabled />
            {SPORTS_LIST.map((s) => (
              <option key={s} value={s}>
                {translateSport(s, language)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t('pastTitleField')}
          <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {t('pastDate')}
            <DateTimeInput
              type="date"
              required
              max={today}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className={field}
            />
          </label>
          <label className={label}>
            {t('pastTime')}
            <DateTimeInput
              type="time"
              required
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              className={field}
            />
          </label>
        </div>
        <label className={label}>
          {t('pastDuration')}
          <input
            type="number"
            min={15}
            max={600}
            step={15}
            value={form.duration}
            onChange={(e) => set('duration', Number(e.target.value))}
            className={field}
          />
        </label>
        <label className={label}>
          {t('pastLocation')}
          <input
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            maxLength={300}
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving || !form.sport}
          className="w-full rounded-xl bg-[#A8DA36] py-3 text-[15px] font-extrabold text-stone-900 disabled:opacity-50"
        >
          {t('pastSubmit')}
        </button>
      </form>
    </div>
  );
}
