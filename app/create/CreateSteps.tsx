'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLanguage } from '@/lib/LanguageContext';
import { translateSport, type TranslationKey } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import type { CreateStep } from '@/lib/sessions/createSteps';

const INTL_LOCALES: Record<string, string> = { es: 'es-CO', en: 'en-US' };

/** "Paso 2 de 3 · Cuándo y dónde", the draft indicator, and three bars. */
export function CreateStepper({ step, draftSaved }: { step: CreateStep; draftSaved: boolean }) {
  const t = useTranslations('createSteps');
  return (
    <div className="mb-5" data-testid="create-stepper">
      <div className="flex items-center justify-between text-xs font-semibold text-theme-secondary mb-2">
        <span>
          {t('stepOf', { n: step })} · <span className="text-theme-primary">{t(`step${step}`)}</span>
        </span>
        {draftSaved && <span className="text-theme-tertiary">{t('draftSaved')}</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1.5 rounded-full ${n <= step ? 'bg-tribe-green' : 'bg-stone-300 dark:bg-tribe-mid'}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Step 1, when this device holds an unpublished form for this user. */
export function DraftBanner({
  sport,
  savedAt,
  onContinue,
  onStartOver,
}: {
  sport: string;
  savedAt: number;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const t = useTranslations('createSteps');
  const { language } = useLanguage();
  const when = new Intl.DateTimeFormat(INTL_LOCALES[language] ?? INTL_LOCALES.en, {
    timeZone: 'America/Bogota',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(savedAt));
  return (
    <div
      className="rounded-xl border border-tribe-green bg-tribe-green/10 p-3 mb-4"
      role="region"
      aria-label={t('draftTitle')}
    >
      <p className="text-sm font-bold text-theme-primary">{t('draftTitle')}</p>
      <p className="text-xs text-theme-secondary mb-2">
        {sport ? `${translateSport(sport, language)} · ` : ''}
        {t('draftSavedAt', { when })}
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={onContinue} className="h-8 px-3 text-xs font-bold">
          {t('draftContinue')}
        </Button>
        <Button type="button" variant="outline" onClick={onStartOver} className="h-8 px-3 text-xs">
          {t('draftStartOver')}
        </Button>
      </div>
    </div>
  );
}

export interface SummaryValues {
  sport: string;
  skill_level: string;
  date: string;
  start_time: string;
  duration: number;
  location: string;
  max_participants: number | '';
  join_policy: string;
  is_paid: boolean;
  price_display: string;
  currency: 'COP' | 'USD';
}

const LEVEL_KEYS: Record<string, TranslationKey> = {
  all_levels: 'allLevels',
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};
const POLICY_KEYS: Record<string, TranslationKey> = {
  open: 'openJoinPolicy',
  curated: 'curatedJoinPolicy',
  invite_only: 'inviteOnlyJoinPolicy',
};

/** Step 3's "Resumen": what will be published, read back before Publicar. */
export function SessionSummary({ values, venueName }: { values: SummaryValues; venueName: string | null }) {
  const t = useTranslations('createSteps');
  const { t: tBase, language } = useLanguage();
  const locale = INTL_LOCALES[language] ?? INTL_LOCALES.en;
  // Noon UTC, so the calendar day never shifts with the device's zone.
  const dateLabel = values.date
    ? new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${values.date}T12:00:00Z`)
      )
    : t('noDateYet');
  const timeLabel = values.start_time ? values.start_time.slice(0, 5) : '';
  const hours =
    values.duration >= 60
      ? `${Math.floor(values.duration / 60)} h${values.duration % 60 ? ` ${values.duration % 60} min` : ''}`
      : `${values.duration} min`;
  const policy = (POLICY_KEYS[values.join_policy] ? tBase(POLICY_KEYS[values.join_policy]) : values.join_policy).split(
    ' - '
  )[0];
  const price =
    values.is_paid && values.price_display
      ? `${values.currency} ${Number(values.price_display).toLocaleString(locale)}`
      : t('free');
  return (
    <div className="rounded-xl bg-stone-900 text-white p-4 space-y-1.5" data-testid="session-summary">
      <p className="text-xs uppercase tracking-wide text-stone-300">{t('summary')}</p>
      <p className="font-bold">
        {values.sport ? translateSport(values.sport, language) : '—'}
        {LEVEL_KEYS[values.skill_level] ? ` · ${tBase(LEVEL_KEYS[values.skill_level])}` : ''}
      </p>
      <p className="text-sm">{[dateLabel, timeLabel, hours].filter(Boolean).join(' · ')}</p>
      <p className="text-sm">{venueName || values.location || t('noPlaceYet')}</p>
      <p className="text-sm">
        {[t('spots', { n: values.max_participants === '' ? '—' : values.max_participants }), policy, price].join(' · ')}
      </p>
    </div>
  );
}
