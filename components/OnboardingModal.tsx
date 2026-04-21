'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, MapPin, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';
import { haptic } from '@/lib/haptics';
import { trackEvent } from '@/lib/analytics';

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const { t, language } = useLanguage();
  const router = useRouter();

  // LR-04 funnel: emit `onboarding_started` once when the modal first
  // mounts so the funnel (signup → email verify → onboarding start →
  // onboarding complete → profile first save) has a clean entry point.
  useEffect(() => {
    trackEvent('onboarding_started');
  }, []);

  /** Wrap onComplete so the legacy and canonical events always fire together. */
  const finishOnboarding = () => {
    trackEvent('onboarding_finished'); // legacy
    trackEvent('onboarding_completed'); // LR-04 canonical
    onComplete();
  };

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
        className="max-w-md rounded-2xl p-6 dark:bg-tribe-card [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to Tribe</DialogTitle>

        <Button
          data-modal-close="true"
          variant="ghost"
          size="icon"
          onClick={finishOnboarding}
          className="absolute top-4 right-4 rounded-full"
        >
          <span className="w-5 h-5 text-stone-600 dark:text-gray-400">✕</span>
        </Button>

        <div className="text-center mb-6 min-h-[180px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {step === 1 ? (
                <div className="mb-4 flex justify-center">
                  <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 dark:text-white">
                    Tribe<span className="text-tribe-green">.</span>
                  </h1>
                </div>
              ) : (
                <motion.div
                  className="mb-4 flex justify-center"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                >
                  <div className="w-16 h-16 bg-tribe-green/20 rounded-full flex items-center justify-center">
                    <Icon className="w-8 h-8 text-tribe-green" />
                  </div>
                </motion.div>
              )}

              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900 dark:text-white mb-2">
                {currentStep.title}
              </h2>
              <p className="text-stone-600 dark:text-gray-300">{currentStep.description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex gap-2 justify-center mb-6">
          {steps.map((_, i) => {
            const isActive = i + 1 === step;
            const isPast = i + 1 < step;
            return (
              <motion.div
                key={i}
                animate={{ width: isActive ? 24 : 8 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={`h-2 rounded-full ${
                  isActive ? 'bg-tribe-green' : isPast ? 'bg-tribe-green/50' : 'bg-stone-300 dark:bg-tribe-mid'
                }`}
              />
            );
          })}
        </div>

        <div className="flex gap-3">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3 border-stone-300 dark:border-tribe-mid text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-mid"
            >
              {language === 'es' ? 'Atrás' : 'Back'}
            </Button>
          )}
          <Button
            onClick={() => {
              if (step === steps.length) {
                void haptic('success');
                finishOnboarding();
                router.push('/profile/edit');
              } else {
                void haptic('light');
                setStep(step + 1);
              }
            }}
            className="flex-1 py-3 font-bold rounded-lg bg-tribe-green text-slate-900 hover:bg-tribe-green"
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
