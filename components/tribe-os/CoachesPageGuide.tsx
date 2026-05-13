'use client';

/**
 * First-visit guide for /os/coaches. Two steps — short because the
 * page is intentionally simple right now and the invite flow isn't
 * shipped yet.
 */

import { useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Crown, UserPlus } from 'lucide-react';
import QuickGuide, { type QuickGuideStep } from '@/components/QuickGuide';
import { useQuickGuide } from '@/hooks/useQuickGuide';

const GUIDE_ID = 'tribe-os-coaches-welcome';

interface CoachesPageGuideProps {
  enabled?: boolean;
  onReplayRef?: (replay: () => void) => void;
}

// ES PENDING VERONICA REVIEW
const stepsByLanguage = {
  en: [
    {
      Icon: Crown,
      title: 'Your gym, your roster',
      body: "You're shown as the owner of this gym. The gym is the billing unit for Tribe.OS — clients, attendance, and revenue all belong to it rather than to a single coach.",
    },
    {
      Icon: UserPlus,
      title: 'Inviting more coaches is coming',
      body: "When you bring on another coach, they'll share access to the same client roster, attendance log, and revenue dashboard. The invite flow lands soon; for now, just you.",
    },
  ],
  es: [
    {
      Icon: Crown,
      title: 'Tu gym, tu equipo',
      body: 'Apareces como propietario de este gym. El gym es la unidad de cobro de Tribe.OS — clientes, asistencias e ingresos le pertenecen a él, no a un solo entrenador.',
    },
    {
      Icon: UserPlus,
      title: 'Invitar más entrenadores llegará pronto',
      body: 'Cuando sumes otro entrenador, compartirán acceso a la misma lista de clientes, registro de asistencias y panel de ingresos. La función para invitar llegará pronto; por ahora, solo tú.',
    },
  ],
} as const satisfies Record<'en' | 'es', readonly QuickGuideStep[]>;

export default function CoachesPageGuide({ enabled = true, onReplayRef }: CoachesPageGuideProps) {
  const { language } = useLanguage();
  const guide = useQuickGuide(GUIDE_ID, { enabled, autoOpen: true });

  useEffect(() => {
    onReplayRef?.(guide.replay);
  }, [onReplayRef, guide.replay]);

  return <QuickGuide id={GUIDE_ID} open={guide.open} onClose={guide.close} steps={stepsByLanguage[language]} />;
}
