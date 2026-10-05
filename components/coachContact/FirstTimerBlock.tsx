'use client';

/**
 * T-AV32 (P1-5). "Tu primera vez con {coach}" on session detail, for someone
 * with no confirmed attendance with this coach. The coach wrote the text.
 * Never shows anyone else: av_first_timer_block returns the coach's first name
 * and the text, nothing about other newcomers. Behind the athlete_value
 * feature "first_timer".
 */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { fetchFirstTimerBlock, type FirstTimerBlock as Block } from '@/lib/dal/firstTimer';

export const FIRST_TIMER_FEATURE = 'first_timer';

export default function FirstTimerBlock({ sessionId, language }: { sessionId: string; language: 'en' | 'es' }) {
  const enabled = useAthleteValueFeature(FIRST_TIMER_FEATURE);
  const [block, setBlock] = useState<Block | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchFirstTimerBlock(createClient(), sessionId).then((r) => {
      if (!cancelled && r.success) setBlock(r.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, sessionId]);

  if (!enabled || !block) return null;

  const title = block.coachFirstName
    ? language === 'es'
      ? `Tu primera vez con ${block.coachFirstName}`
      : `Your first time with ${block.coachFirstName}`
    : language === 'es'
      ? 'Tu primera vez'
      : 'Your first time';

  return (
    <section className="rounded-xl bg-tribe-green/20 p-4" aria-label={title}>
      <h2 className="flex items-center gap-2 font-bold text-tribe-dark dark:text-white">
        <Sparkles className="w-5 h-5" aria-hidden="true" />
        {title}
      </h2>
      <p className="mt-2 text-sm text-tribe-dark dark:text-white whitespace-pre-line">{block.text}</p>
    </section>
  );
}
