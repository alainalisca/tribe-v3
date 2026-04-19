'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';

interface SafetyWaiverModalProps {
  onAccept: () => void;
  onCancel: () => void;
}

export default function SafetyWaiverModal({ onAccept, onCancel }: SafetyWaiverModalProps) {
  const { language } = useLanguage();
  const [acknowledged, setAcknowledged] = useState({
    platform: false,
    risks: false,
    guidelines: false,
    age: false,
  });

  const allChecked = Object.values(acknowledged).every((v) => v);

  const tr =
    language === 'es'
      ? {
          title: 'Seguridad ante todo',
          intro: '¡Bienvenido a Tribe! Antes de comenzar, por favor acepta estos puntos importantes de seguridad:',
          platform:
            'Entiendo que Tribe es solo una plataforma de coordinación y no verifica usuarios ni supervisa sesiones',
          risks: 'Asumo todos los riesgos de participar en actividades físicas, incluyendo posibles lesiones',
          guidelinesPre: 'Seguiré las ',
          guidelinesLink: 'guías de seguridad',
          guidelinesPost: ' (reunirse en público, avisar a alguien, etc.)',
          age: 'Tengo 18 años o más y estoy físicamente apto/a para participar en las actividades a las que me uno',
          accept: 'Entiendo y acepto',
          cancel: 'Cancelar',
        }
      : {
          title: 'Safety First',
          intro: 'Welcome to Tribe! Before you start, please acknowledge these important safety points:',
          platform:
            'I understand Tribe is a coordination platform only and does not verify users or supervise sessions',
          risks: 'I assume all risks of participating in physical activities, including possible injury',
          guidelinesPre: 'I will follow ',
          guidelinesLink: 'safety guidelines',
          guidelinesPost: ' (meet in public, tell someone, etc.)',
          age: "I'm 18 or older and physically able to participate in the activities I join",
          accept: 'I Understand and Accept',
          cancel: 'Cancel',
        };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        data-modal="true"
        className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-8 dark:bg-tribe-dark [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-2xl font-bold text-stone-900 dark:text-white">{tr.title}</DialogTitle>

        <p className="text-stone-600 dark:text-gray-300 mb-6">{tr.intro}</p>

        <div className="space-y-4 mb-6">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.platform}
              onChange={(e) =>
                setAcknowledged({
                  ...acknowledged,
                  platform: e.target.checked,
                })
              }
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              {tr.platform}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.risks}
              onChange={(e) =>
                setAcknowledged({
                  ...acknowledged,
                  risks: e.target.checked,
                })
              }
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              {tr.risks}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.guidelines}
              onChange={(e) =>
                setAcknowledged({
                  ...acknowledged,
                  guidelines: e.target.checked,
                })
              }
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              {tr.guidelinesPre}
              <Link
                href="/legal/safety"
                target="_blank"
                className="underline text-tribe-green hover:text-tribe-green/80"
              >
                {tr.guidelinesLink}
              </Link>
              {tr.guidelinesPost}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.age}
              onChange={(e) =>
                setAcknowledged({
                  ...acknowledged,
                  age: e.target.checked,
                })
              }
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              {tr.age}
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <Button onClick={onAccept} disabled={!allChecked} className="flex-1 py-3 rounded-lg font-semibold">
            {tr.accept}
          </Button>
          <Button
            data-modal-close="true"
            variant="outline"
            onClick={onCancel}
            className="px-6 py-3 border-stone-300 dark:border-tribe-mid text-stone-900 dark:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-mid"
          >
            {tr.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
