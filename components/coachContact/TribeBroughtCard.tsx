'use client';

/**
 * T-AV31 (P1-4). "Lo que Tribe te trajo este mes": the coach's private view of
 * the new people Tribe brought them, on the instructor dashboard. Behind the
 * athlete_value feature "brought". Reads only; see migration 8003 for what
 * each number counts.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { fetchTribeBrought, type BroughtGroup, type TribeBrought } from '@/lib/dal/tribeBrought';

export const BROUGHT_FEATURE = 'brought';

/** Names shown before "+N". Six fits one line on a phone. */
const MAX_NAMES = 6;

export function namesLine(group: BroughtGroup, language: 'en' | 'es'): string {
  const shown = group.names.slice(0, MAX_NAMES).join(', ');
  const rest = group.count - Math.min(group.names.length, MAX_NAMES);
  if (rest <= 0) return shown;
  return language === 'es' ? `${shown} y ${rest} más` : `${shown} and ${rest} more`;
}

function Row({
  label,
  group,
  empty,
  language,
}: {
  label: string;
  group: BroughtGroup;
  empty: string;
  language: 'en' | 'es';
}) {
  return (
    <div className="py-3 border-t border-stone-200 dark:border-tribe-mid first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-theme-primary">{label}</span>
        <span className="text-2xl font-bold text-theme-primary">{group.count}</span>
      </div>
      <p className="text-sm text-theme-secondary mt-1">{group.count > 0 ? namesLine(group, language) : empty}</p>
    </div>
  );
}

export default function TribeBroughtCard({ language }: { language: 'en' | 'es' }) {
  const enabled = useAthleteValueFeature(BROUGHT_FEATURE);
  const [data, setData] = useState<TribeBrought | null>(null);
  const es = language === 'es';

  useEffect(() => {
    if (!enabled) return;
    void fetchTribeBrought(createClient()).then((r) => {
      if (r.success && r.data) setData(r.data);
    });
  }, [enabled]);

  if (!enabled || !data) return null;

  return (
    <Card className="dark:bg-tribe-card">
      <CardContent className="p-4">
        <h3 className="font-bold text-theme-primary mb-1">
          {es ? 'Lo que Tribe te trajo este mes' : 'What Tribe brought you this month'}
        </h3>
        <Row
          label={es ? 'Contactos' : 'Contacts'}
          group={data.contacts}
          empty={
            es ? 'Comparte tu perfil de Tribe para recibir contactos.' : 'Share your Tribe profile to get contacts.'
          }
          language={language}
        />
        <Row
          label={es ? 'Primeras visitas confirmadas' : 'Confirmed first visits'}
          group={data.firstVisits}
          empty={
            es
              ? 'Marca la asistencia en tus clases para verlas aquí.'
              : 'Mark attendance in your classes to see them here.'
          }
          language={language}
        />
        <Row
          label={es ? 'Volvieron en 30 días' : 'Came back within 30 days'}
          group={data.cameBack}
          empty={es ? 'Aún nadie este mes.' : 'No one yet this month.'}
          language={language}
        />
      </CardContent>
    </Card>
  );
}
