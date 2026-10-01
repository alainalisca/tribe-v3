'use client';

import { useState } from 'react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { DOOR_OUTCOMES, setPassOutcome, type DoorOutcome } from '@/lib/dal/passDoor';

/**
 * T-AV25. "What happened after class?": the four outcomes, through
 * av_athletes_set_outcome (8205). Shared by the verify page and the door list.
 *
 * The database is the rule: `joined` is refused without a confirmed show-up
 * (`not_attended`) and a retained or settled join cannot change (`locked`).
 * Callers render these only once the pass is confirmed, but the refusal is
 * still worded here, because a second tab or a stale list can get there.
 */
interface DoorOutcomeButtonsProps {
  passCode: string;
  initialOutcome: DoorOutcome | null;
  /** T-AV26: the gym dashboard re-reads its summary after a saved outcome. */
  onSaved?: () => void;
}

type T = ReturnType<typeof useTranslations>;

function label(outcome: DoorOutcome, t: T): string {
  switch (outcome) {
    case 'joined':
      return t('outcomeJoined');
    case 'follow_up':
      return t('outcomeFollowUp');
    case 'not_now':
      return t('outcomeNotNow');
    default:
      return t('outcomeMember');
  }
}

export default function DoorOutcomeButtons({ passCode, initialOutcome, onSaved }: DoorOutcomeButtonsProps) {
  const t = useTranslations('door');
  const [outcome, setOutcome] = useState<DoorOutcome | null>(initialOutcome);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);

  async function choose(next: DoorOutcome) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const result = await setPassOutcome(createClient(), passCode, next);
    setSaving(false);
    if (result.success) {
      setOutcome(next);
      setMessage({ kind: 'saved', text: t('outcomeSaved') });
      onSaved?.();
      return;
    }
    setMessage({ kind: 'error', text: result.error === 'not_attended' ? t('confirmFirst') : t('error') });
  }

  return (
    <div data-outcomes={passCode}>
      <p className="text-sm font-semibold text-tribe-dark">{t('outcomeTitle')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {DOOR_OUTCOMES.map((o) => (
          <button
            key={o}
            type="button"
            data-outcome={o}
            aria-pressed={outcome === o}
            disabled={saving}
            onClick={() => choose(o)}
            className={
              outcome === o
                ? 'rounded-xl bg-tribe-green px-3 py-3 text-sm font-semibold text-tribe-dark disabled:opacity-60'
                : 'rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-tribe-dark disabled:opacity-60'
            }
          >
            {label(o, t)}
          </button>
        ))}
      </div>
      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'mt-2 text-sm text-red-700' : 'mt-2 text-sm text-stone-600'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
