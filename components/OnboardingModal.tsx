'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, MapPin, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const { t, language } = useLanguage();
  const router = useRouter();

  const steps = [
    {
      title: t('neverTrainAlone'),
      description: t('onboardingDesc1'),
      icon: Users,
    },
    {
      title: t('findYourTribe'),
      description: t('onboardingDescBrowse'),
      icon: MapPin,
    },
    {
      title: t('joinSessionsInstantly'),
      description: t('onboardingDesc2'),
      icon: Calendar,
    },
    {
      title: t('completeYourProfile'),
      description: t('onboardingDesc3'),
      icon: User,
    },
  ];

  const currentStep = steps[step - 1];
  const Icon = currentStep.icon;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        data-modal="true"
        className="max-w-md rounded-2xl p-6 dark:bg-[#6B7178] [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to Tribe</DialogTitle>

        <Button
          data-modal-close="true"
          variant="ghost"
          size="icon"
          onClick={onComplete}
          className="absolute top-4 right-4 rounded-full"
        >
          <span className="w-5 h-5 text-stone-600 dark:text-gray-400">✕</span>
        </Button>

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

          <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-2">{currentStep.title}</h2>
          <p className="text-stone-600 dark:text-gray-300">{currentStep.description}</p>
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
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-[#52575D]"
            >
              {language === 'es' ? 'Atrás' : 'Back'}
            </Button>
          )}
          <Button
            onClick={() => {
              if (step === steps.length) {
                onComplete();
                router.push('/profile/edit');
              } else {
                setStep(step + 1);
              }
            }}
            className="flex-1 py-3 font-semibold rounded-lg"
          >
            {step === steps.length
              ? language === 'es'
                ? 'Comenzar'
                : 'Get Started'
              : language === 'es'
                ? 'Siguiente'
                : 'Next'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
