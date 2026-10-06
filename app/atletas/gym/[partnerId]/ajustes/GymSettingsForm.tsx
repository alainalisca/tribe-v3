'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { showSuccess } from '@/lib/toast';
import type { DateField, NumberField, ProgramSettings, TextField } from '@/lib/atletas/gymSettings';

/**
 * T-AV26 "Ajustes": every editable athlete_programs column, in English and
 * Spanish where it is text. Class access is free text (D13). Not here, on
 * purpose: is_active (admin-only, T-AV27) and partner_id.
 *
 * The whole form is sent on every save, starting from the values the server
 * loaded, so no column is blanked by a field the form did not show. The route
 * validates (lib/atletas/gymSettings.ts) and the owner's session writes.
 */
interface GymSettingsFormProps {
  partnerId: string;
  initial: ProgramSettings;
}

type FormState = Record<TextField | DateField, string> & Record<NumberField, string>;

const toForm = (s: ProgramSettings): FormState => ({
  welcome_offer_en: s.welcome_offer_en ?? '',
  welcome_offer_es: s.welcome_offer_es ?? '',
  showup_reward_en: s.showup_reward_en ?? '',
  showup_reward_es: s.showup_reward_es ?? '',
  class_access_en: s.class_access_en ?? '',
  class_access_es: s.class_access_es ?? '',
  conversion_bonus_note_en: s.conversion_bonus_note_en ?? '',
  conversion_bonus_note_es: s.conversion_bonus_note_es ?? '',
  conversion_bonus_cop: s.conversion_bonus_cop === null ? '' : String(s.conversion_bonus_cop),
  retention_days: String(s.retention_days),
  promote_at_showups: String(s.promote_at_showups),
  max_athletes: String(s.max_athletes),
  pilot_starts_on: s.pilot_starts_on ?? '',
  pilot_ends_on: s.pilot_ends_on ?? '',
});

/** Empty stays '' (the route reads it as NULL where allowed); a typed number is sent as a number. */
const num = (v: string): number | string => (v.trim() === '' ? '' : Number(v));

const input = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base text-tribe-dark';
const label = 'block text-xs font-semibold text-theme-secondary';

export default function GymSettingsForm({ partnerId, initial }: GymSettingsFormProps) {
  const t = useTranslations('gym');
  const td = useTranslations('door');
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);
  const base = `/atletas/gym/${partnerId}`;

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/atletas/gym/${partnerId}/settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          conversion_bonus_cop: num(form.conversion_bonus_cop),
          retention_days: num(form.retention_days),
          promote_at_showups: num(form.promote_at_showups),
          max_athletes: num(form.max_athletes),
        }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('saved');
      showSuccess(t('settingsSaved'));
    } catch (error: unknown) {
      // A network failure is worded like any other failed save; the route logs server-side.
      console.error('[GymSettingsForm] save failed', error);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }

  const pair = (title: string, en: TextField, es: TextField, hint?: string) => (
    <fieldset className="space-y-2 rounded-2xl bg-theme-card p-4" data-setting={en.replace(/_en$/, '')}>
      <legend className="float-left w-full text-sm font-bold text-theme-primary">{title}</legend>
      {hint ? <p className="text-xs text-theme-secondary">{hint}</p> : null}
      <label className={label}>
        {t('settingsEs')}
        <textarea rows={2} maxLength={500} value={form[es]} onChange={set(es)} className={input} name={es} />
      </label>
      <label className={label}>
        {t('settingsEn')}
        <textarea rows={2} maxLength={500} value={form[en]} onChange={set(en)} className={input} name={en} />
      </label>
    </fieldset>
  );

  const one = (title: string, key: NumberField | DateField, type: 'number' | 'date', min?: number, max?: number) => (
    <label className="block space-y-1 rounded-2xl bg-theme-card p-4" data-setting={key}>
      <span className="block text-sm font-bold text-theme-primary">{title}</span>
      <input
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        min={min}
        max={max}
        value={form[key]}
        onChange={set(key)}
        className={input}
        name={key}
      />
    </label>
  );

  return (
    <div className="min-h-screen bg-theme-page pb-nav">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-2 px-4">
          <Link
            href={`${base}/`}
            aria-label={t('title')}
            className="-ml-2 flex min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <ArrowLeft className="h-6 w-6 text-theme-primary" aria-hidden="true" />
          </Link>
          <h1 className="text-lg font-bold text-theme-primary">{t('tabSettings')}</h1>
        </div>
      </div>

      <form
        onSubmit={save}
        className="pt-header max-w-2xl mx-auto px-4 pb-6 space-y-3 [&>*:first-child]:mt-4"
        data-gym-settings
      >
        {pair(t('settingsOffer'), 'welcome_offer_en', 'welcome_offer_es')}
        {pair(t('settingsShowup'), 'showup_reward_en', 'showup_reward_es', t('settingsShowupHint'))}
        {pair(t('settingsAccess'), 'class_access_en', 'class_access_es')}
        {one(t('settingsBonus'), 'conversion_bonus_cop', 'number', 0, 5_000_000)}
        {pair(t('settingsBonusNote'), 'conversion_bonus_note_en', 'conversion_bonus_note_es')}
        {one(t('settingsRetention'), 'retention_days', 'number', 7, 180)}
        {one(t('settingsPromoteAt'), 'promote_at_showups', 'number', 1, 100)}
        {one(t('settingsMax'), 'max_athletes', 'number', 1, 50)}
        {one(t('settingsPilotStart'), 'pilot_starts_on', 'date')}
        {one(t('settingsPilotEnd'), 'pilot_ends_on', 'date')}

        <button
          type="submit"
          disabled={saving}
          data-settings-save
          className="w-full rounded-xl bg-tribe-green px-4 py-3 text-base font-bold text-tribe-dark disabled:opacity-50"
        >
          {t('settingsSave')}
        </button>
        {status === 'saved' ? (
          <p role="status" className="text-center text-sm text-theme-secondary" data-settings-status="saved">
            {t('settingsSaved')}
          </p>
        ) : null}
        {status === 'error' ? (
          <p role="alert" className="text-center text-sm text-red-700" data-settings-status="error">
            {td('error')}
          </p>
        ) : null}
        <p className="px-2 text-center text-xs text-theme-secondary">{t('money')}</p>
      </form>
      <BottomNav />
    </div>
  );
}
