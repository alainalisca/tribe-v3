'use client';

import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

interface ProfilePromptProps {
  onDismiss: () => void;
}

export default function ProfilePrompt({ onDismiss }: ProfilePromptProps) {
  const router = useRouter();

  return (
    <div className="bg-tribe-green/10 border border-tribe-green rounded-xl p-4 mb-4 relative">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-white/50 rounded-lg transition"
      >
        <X className="w-4 h-4 text-stone-600" />
      </button>
      
      <div className="pr-8">
        <h3 className="font-bold text-stone-900 mb-1">
          ¡Completa tu Perfil!
        </h3>
        <p className="text-sm text-stone-700 mb-3">
          Añade tus deportes favoritos para encontrar mejores compañeros de entrenamiento
        </p>
        <button
          onClick={() => router.push('/profile')}
          className="px-4 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition text-sm"
        >
          Completar Perfil
        </button>
      </div>
    </div>
  );
}
