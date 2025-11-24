'use client';

import { useState } from 'react';
import { X, Users, Calendar, User } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const { language } = useLanguage();

  const steps = language === 'es' ? [
    {
      title: 'Nunca Entrenes Solo',
      description: 'Encuentra compañeros de entrenamiento y sesiones en tu ciudad',
      icon: Users
    },
    {
      title: 'Encuentra Compañeros',
      description: 'Conecta con personas que comparten tus metas y horarios',
      icon: Users
    },
    {
      title: 'Únete a Sesiones',
      description: 'Explora carreras, entrenamientos, clases y eventos cerca de ti',
      icon: Calendar
    },
    {
      title: 'Completa tu Perfil',
      description: 'Añade tus deportes favoritos para mejores coincidencias',
      icon: User
    }
  ] : [
    {
      title: 'Never Train Alone',
      description: 'Find training partners and fitness sessions in your city',
      icon: Users
    },
    {
      title: 'Find Training Partners',
      description: 'Connect with people who share your fitness goals and schedule',
      icon: Users
    },
    {
      title: 'Join Sessions Instantly',
      description: 'Browse runs, gym sessions, classes and events near you',
      icon: Calendar
    },
    {
      title: 'Complete Your Profile',
      description: 'Add your favorite sports for better matches',
      icon: User
    }
  ];

  const currentStep = steps[step - 1];
  const Icon = currentStep.icon;

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
          {step === 1 ? (
            <div className="mb-4 flex justify-center">
              <h1 className="text-4xl font-bold text-stone-900 dark:text-white">
                Tribe<span className="text-tribe-green">.</span>
              </h1>
            </div>
          ) : (
            <div className="mb-4 flex justify-center">
              <div className="w-16 h-16 bg-tribe-green/20 rounded-full flex items-center justify-center">
                <Icon className="w-8 h-8 text-tribe-green" />
              </div>
            </div>
          )}
          
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
                  : i + 1 < step
                  ? 'w-2 bg-tribe-green/50'
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
              {language === 'es' ? 'Atrás' : 'Back'}
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
            {step === steps.length 
              ? (language === 'es' ? 'Comenzar' : 'Get Started')
              : (language === 'es' ? 'Siguiente' : 'Next')
            }
          </button>
        </div>
      </div>
    </div>
  );
}
