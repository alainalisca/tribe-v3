'use client';

import { Users2 } from 'lucide-react';
import ComingSoonPage from '@/components/tribe-os/ComingSoonPage';

export default function TeamsPage() {
  return (
    <ComingSoonPage
      Icon={Users2}
      title={{ en: 'Teams', es: 'Equipos' }}
      description={{
        en: 'Group members into teams like Competition Squad, Morning Crew, or Foundations. Assign a head coach, see at-risk counts at a glance, and message a whole team in one tap.',
        es: 'Agrupa a tus miembros en equipos como Competition Squad, Crew de la Mañana o Foundations. Asigna un coach principal, ve los miembros en riesgo de un vistazo y envía un mensaje a todo el equipo en un toque.',
      }}
    />
  );
}
