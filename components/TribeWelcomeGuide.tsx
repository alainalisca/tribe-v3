'use client';

/**
 * General Tribe welcome guide — auto-shows on first feed visit for
 * signed-in users. Distinct from OnboardingModal (which handles
 * profile completion immediately after signup): this is feature
 * discovery, not data collection.
 *
 * Five steps:
 *   1. Welcome / what Tribe is
 *   2. Find a session (filters, map, feed)
 *   3. Create your own session
 *   4. Message / community
 *   5. Tribe.OS (for instructors who want the business side)
 *
 * Dismissible. Seen-state persists in localStorage. "Take the tour
 * again" can be wired from any caller via the replay callback ref.
 *
 * Bilingual EN+ES (ES marked PENDING VERONICA).
 */

import { useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Sparkles, Search, Plus, MessageCircle, Briefcase } from 'lucide-react';
import QuickGuide, { type QuickGuideStep } from '@/components/QuickGuide';
import { useQuickGuide } from '@/hooks/useQuickGuide';

const GUIDE_ID = 'tribe-welcome';

interface TribeWelcomeGuideProps {
  /**
   * When false, auto-open is suppressed. Wire to user-is-signed-in
   * so we don't auto-popup at anonymous landing-page visitors.
   */
  enabled?: boolean;
  /**
   * Callback ref the parent uses to grab the replay function. Lets
   * a "Take the tour again" link in profile/settings re-trigger
   * the modal without a context provider.
   */
  onReplayRef?: (replay: () => void) => void;
}

// ES PENDING VERONICA REVIEW
const stepsByLanguage = {
  en: [
    {
      Icon: Sparkles,
      title: 'Welcome to Tribe',
      body: "Tribe connects you with athletes nearby to train together. Whether you're looking for a partner for tomorrow's run or want to host a yoga session, this is the app for it.",
    },
    {
      Icon: Search,
      title: 'Find a session',
      body: 'Browse the feed below or use the filters at the top to narrow by sport, distance, date, and pricing. Tap any session to see details and join.',
    },
    {
      Icon: Plus,
      title: 'Create your own',
      body: "Tap the green plus button in the bottom nav to start a session. Pick a sport, set a location, decide if it's free or paid — your community will see it in their feed.",
    },
    {
      Icon: MessageCircle,
      title: 'Connect with athletes',
      body: 'Once you join a session, you can chat with the host and other participants. Use the Messages tab to keep conversations going outside of any one session.',
    },
    {
      Icon: Briefcase,
      title: 'For instructors: Tribe.OS',
      body: 'If you charge for sessions, the Tribe.OS dashboard handles client management, payments through Stripe, and revenue tracking. Find it on your profile.',
    },
  ],
  es: [
    {
      Icon: Sparkles,
      title: 'Bienvenido a Tribe',
      body: 'Tribe te conecta con atletas cerca de ti para entrenar juntos. Ya sea que busques un compañero para correr mañana o quieras organizar una sesión de yoga, esta es la app.',
    },
    {
      Icon: Search,
      title: 'Encuentra una sesión',
      body: 'Explora el feed abajo o usa los filtros arriba para acotar por deporte, distancia, fecha y precio. Toca cualquier sesión para ver detalles y unirte.',
    },
    {
      Icon: Plus,
      title: 'Crea la tuya',
      body: 'Toca el botón verde con el más en la barra de abajo para iniciar una sesión. Elige un deporte, una ubicación, decide si es gratis o de pago — tu comunidad la verá en su feed.',
    },
    {
      Icon: MessageCircle,
      title: 'Conecta con atletas',
      body: 'Cuando te unas a una sesión podrás chatear con el anfitrión y los participantes. Usa la pestaña Mensajes para mantener conversaciones fuera de una sesión específica.',
    },
    {
      Icon: Briefcase,
      title: 'Para instructores: Tribe.OS',
      body: 'Si cobras por tus sesiones, el panel de Tribe.OS gestiona tus clientes, pagos vía Stripe y seguimiento de ingresos. Lo encuentras en tu perfil.',
    },
  ],
} as const satisfies Record<'en' | 'es', readonly QuickGuideStep[]>;

export default function TribeWelcomeGuide({ enabled = true, onReplayRef }: TribeWelcomeGuideProps) {
  const { language } = useLanguage();
  const guide = useQuickGuide(GUIDE_ID, { enabled, autoOpen: true });

  useEffect(() => {
    onReplayRef?.(guide.replay);
  }, [onReplayRef, guide.replay]);

  return <QuickGuide id={GUIDE_ID} open={guide.open} onClose={guide.close} steps={stepsByLanguage[language]} />;
}
