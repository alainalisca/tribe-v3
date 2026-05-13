'use client';

/**
 * First-visit guide for /os/clients. Three steps covering what's
 * on the page that isn't immediately obvious from looking at it:
 *
 *   1. The roster lives here — start by adding clients
 *   2. Status (active / lead / lapsed / inactive) and how the
 *      at-risk widget on the dashboard uses it
 *   3. Tags + filter pills + search — how to find a specific
 *      client once the roster grows
 *
 * Separate from the Tribe.OS welcome guide because that one is
 * about the OS surface as a whole; this one is page-specific. Both
 * are dismissible and use independent seen-flags.
 */

import { useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { UserPlus, Tag, Filter } from 'lucide-react';
import QuickGuide, { type QuickGuideStep } from '@/components/QuickGuide';
import { useQuickGuide } from '@/hooks/useQuickGuide';

const GUIDE_ID = 'tribe-os-clients-welcome';

interface ClientsPageGuideProps {
  /** Suppress auto-open (e.g. while the page is still loading). */
  enabled?: boolean;
  onReplayRef?: (replay: () => void) => void;
}

// ES PENDING VERONICA REVIEW
const stepsByLanguage = {
  en: [
    {
      Icon: UserPlus,
      title: 'Your client roster lives here',
      body: 'Tap "New client" to add the people you train. Each client has their own profile with contact info, tags, notes, and attendance history. Only you can see them.',
    },
    {
      Icon: Tag,
      title: 'Status tells you who needs attention',
      body: 'Set each client\'s status — Active, Lead, Lapsed, or Inactive. The dashboard automatically surfaces "Active" clients you haven\'t seen lately so you know who to check in with.',
    },
    {
      Icon: Filter,
      title: 'Filter and search to find anyone fast',
      body: 'Once you have a few clients, the status pills and tag chips above the list let you narrow by category. The search box matches names. Filters combine, so "Active + vip" works.',
    },
  ],
  es: [
    {
      Icon: UserPlus,
      title: 'Tu lista de clientes vive aquí',
      body: 'Toca "Nuevo cliente" para agregar a las personas que entrenas. Cada cliente tiene su propio perfil con contacto, etiquetas, notas e historial de asistencias. Solo tú los ves.',
    },
    {
      Icon: Tag,
      title: 'El estado te dice a quién atender',
      body: 'Marca el estado de cada cliente — Activo, Prospecto, Suspendido o Inactivo. El panel resalta automáticamente los clientes "Activos" que no has visto últimamente para que sepas a quién contactar.',
    },
    {
      Icon: Filter,
      title: 'Filtra y busca para encontrar a cualquiera',
      body: 'Cuando tengas algunos clientes, las píldoras de estado y las etiquetas sobre la lista te permiten acotar por categoría. El buscador empareja por nombre. Los filtros se combinan, así que "Activo + vip" funciona.',
    },
  ],
} as const satisfies Record<'en' | 'es', readonly QuickGuideStep[]>;

export default function ClientsPageGuide({ enabled = true, onReplayRef }: ClientsPageGuideProps) {
  const { language } = useLanguage();
  const guide = useQuickGuide(GUIDE_ID, { enabled, autoOpen: true });

  useEffect(() => {
    onReplayRef?.(guide.replay);
  }, [onReplayRef, guide.replay]);

  return <QuickGuide id={GUIDE_ID} open={guide.open} onClose={guide.close} steps={stepsByLanguage[language]} />;
}
