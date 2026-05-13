'use client';

/**
 * Tribe.OS welcome guide. Four steps, auto-shows on first
 * /os/dashboard visit for premium users, dismissible.
 *
 * Why scoped to premium: we don't want to lecture a not-premium
 * visitor who's just exploring the upgrade card. The hook's
 * `enabled` gate handles that — non-premium visitors don't see
 * the auto-open, but the guide is still mountable (so e.g. a
 * "Take the tour" link from a settings page could trigger it
 * after they upgrade).
 *
 * Replay: the parent can pass a `replayRef` (function ref) that
 * gets populated with the hook's `replay` function. Parent
 * components — like the OS shell or the dashboard's "Take the
 * tour again" button — can then trigger the guide programmatically.
 *
 * Bilingual EN+ES. Spanish marked PENDING VERONICA REVIEW.
 */

import { useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Users, DollarSign, Compass, Sparkles } from 'lucide-react';
import QuickGuide, { type QuickGuideStep } from '@/components/QuickGuide';
import { useQuickGuide } from '@/hooks/useQuickGuide';

const GUIDE_ID = 'tribe-os-welcome';

interface TribeOSWelcomeGuideProps {
  /**
   * When false, auto-open is suppressed. Typically wired to the
   * caller's premium-active state. The guide can still be replayed
   * via `onReplayRef` regardless of this value.
   */
  enabled?: boolean;
  /**
   * Callback ref the parent uses to grab the replay function. The
   * pattern lets a button outside the guide trigger the modal
   * without a context provider — parent calls
   * `replayRef.current?.()` to re-show.
   */
  onReplayRef?: (replay: () => void) => void;
}

// ES PENDING VERONICA REVIEW
const stepsByLanguage = {
  en: [
    {
      Icon: Sparkles,
      title: 'Welcome to Tribe.OS',
      body: "Tribe.OS is the business side of Tribe — for instructors who charge for sessions. Your free Tribe experience is unchanged. Here's what you can do here.",
    },
    {
      Icon: Users,
      title: 'Manage your clients',
      body: 'Add the people you train, log attendance per session, attach private notes and tags. Only you see your client list.',
    },
    {
      Icon: DollarSign,
      title: 'Track revenue and take payments',
      body: 'Create paid sessions, take payments through Stripe Connect, see your revenue by week or month, and export to CSV for tax season.',
    },
    {
      Icon: Compass,
      title: 'Find your way around',
      body: 'Use the bar at the top (or bottom on mobile) to jump between Dashboard, Clients, Revenue, and Coaches. The dashboard surfaces members who need a check-in.',
    },
  ],
  es: [
    {
      Icon: Sparkles,
      title: 'Bienvenido a Tribe.OS',
      body: 'Tribe.OS es el lado del negocio de Tribe — para instructores que cobran por sus sesiones. Tu Tribe gratis no cambia. Esto es lo que puedes hacer aquí.',
    },
    {
      Icon: Users,
      title: 'Gestiona tus clientes',
      body: 'Agrega a las personas que entrenas, registra asistencia por sesión, añade notas privadas y etiquetas. Solo tú ves tu lista.',
    },
    {
      Icon: DollarSign,
      title: 'Sigue tus ingresos y recibe pagos',
      body: 'Crea sesiones pagadas, recibe pagos a través de Stripe Connect, mira tus ingresos por semana o mes, y exporta a CSV para la temporada de impuestos.',
    },
    {
      Icon: Compass,
      title: 'Encuentra tu camino',
      body: 'Usa la barra de arriba (o la de abajo en móvil) para moverte entre Panel, Clientes, Ingresos y Entrenadores. El panel resalta los miembros que necesitan seguimiento.',
    },
  ],
} as const satisfies Record<'en' | 'es', readonly QuickGuideStep[]>;

export default function TribeOSWelcomeGuide({ enabled = true, onReplayRef }: TribeOSWelcomeGuideProps) {
  const { language } = useLanguage();
  const guide = useQuickGuide(GUIDE_ID, { enabled, autoOpen: true });

  // Expose `replay` to the parent via the ref callback. Wraps in
  // useEffect so we only set the ref after mount (parent might
  // render the replay button conditionally based on its own state).
  useEffect(() => {
    onReplayRef?.(guide.replay);
  }, [onReplayRef, guide.replay]);

  return <QuickGuide id={GUIDE_ID} open={guide.open} onClose={guide.close} steps={stepsByLanguage[language]} />;
}
