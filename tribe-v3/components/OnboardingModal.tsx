'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);

  const steps = [
    {
      title: '¡Bienvenido a Tribe!',
      description: 'Encuentra compañeros de entrenamiento en tiempo real',
      emoji: '🏃‍♂️'
    },
    {
      title: 'Únete a Sesiones',
      description: 'Explora sesiones cerca de ti y únete con un clic',
      emoji: '📍'
    },
    {
      title: 'Crea tus Propias Sesiones',
      description: 'Organiza entrenamientos y construye tu tribu',
      emoji: '✨'
    },
    {
      title: 'Completa tu Perfil',
      description: 'Añade tus deportes favoritos para mejores coincidencias',
      emoji: '👤'
    }
  ];

  const currentStep = steps[step - 1];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#6B7178] rounded-2xl max-w-md w-full p-6 relative">
        <button
          onClick={onComplete}
          className="absolute top-4 right-4 p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-lg transition"
        >
          <X className="w-5 h-5 text-stone-600 dark:text-gray-400" />
        </button>

        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center">
            <h1 className="text-5xl font-bold text-stone-900 dark:text-white">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
          </div>
          <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">
            {currentStep.title}
          </h2>
          <p className="text-stone-600 dark:text-gray-300">
            {currentStep.description}
          </p>
        </div>

        <div className="flex gap-2 justify-center mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i + 1 === step
                  ? 'w-8 bg-tribe-green'
                  : 'w-2 bg-stone-300 dark:bg-[#52575D]'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 border border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-[#52575D] transition"
            >
              Atrás
            </button>
          )}
          <button
            onClick={() => {
              if (step === steps.length) {
                onComplete();
              } else {
                setStep(step + 1);
              }
            }}
            className="flex-1 py-3 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition"
          >
            {step === steps.length ? 'Comenzar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
