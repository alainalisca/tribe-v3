'use client';

import { Calendar } from 'lucide-react';
import ComingSoonPage from '@/components/tribe-os/ComingSoonPage';

export default function SchedulePage() {
  return (
    <ComingSoonPage
      Icon={Calendar}
      title={{ en: 'Schedule', es: 'Horario' }}
      description={{
        en: 'A weekly view of every class your gym runs. Create recurring sessions, see enrollment at a glance, and switch between list and calendar layouts.',
        es: 'Una vista semanal de todas las clases que ofrece tu gym. Crea sesiones recurrentes, mira la inscripción de un vistazo y alterna entre vista de lista y calendario.',
      }}
    />
  );
}
