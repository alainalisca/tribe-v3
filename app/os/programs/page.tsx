'use client';

import { ClipboardList } from 'lucide-react';
import ComingSoonPage from '@/components/tribe-os/ComingSoonPage';

export default function ProgramsPage() {
  return (
    <ComingSoonPage
      Icon={ClipboardList}
      title={{ en: 'Programs', es: 'Programas' }}
      description={{
        en: 'Build and assign workout programs to your members. Track progress, share programming, and keep everyone on the same page.',
        es: 'Crea y asigna programas de entrenamiento a tus miembros. Sigue el progreso, comparte la programación y mantén a todos alineados.',
      }}
    />
  );
}
