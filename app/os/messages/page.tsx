'use client';

import { MessageSquare } from 'lucide-react';
import ComingSoonPage from '@/components/tribe-os/ComingSoonPage';

export default function MessagesPage() {
  return (
    <ComingSoonPage
      Icon={MessageSquare}
      title={{ en: 'Messages', es: 'Mensajes' }}
      description={{
        en: "Message your members directly inside Tribe.OS. Threaded conversations, broadcast to a team, and keep follow-up history attached to each member's profile.",
        es: 'Envía mensajes directos a tus miembros desde Tribe.OS. Conversaciones por hilos, envíos a equipos enteros, e historial de seguimiento ligado a cada miembro.',
      }}
    />
  );
}
