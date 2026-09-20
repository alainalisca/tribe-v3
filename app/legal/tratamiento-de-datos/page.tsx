/**
 * Page: /legal/tratamiento-de-datos, Política de Tratamiento de Datos Personales
 *
 * The Ley 1581 de 2012 authorisation the pass consent checkbox links to. It is
 * a different document from /legal/privacy, which is a general privacy policy:
 * this one is the specific legal basis for handing a person's name, WhatsApp
 * and email to a partner gym.
 *
 * Same shell and the same Tailwind classes as the other legal pages. The only
 * difference is the body shape: the approved text interleaves paragraphs and
 * bullet lists inside a section, which the privacy page's paragraphs-then-list
 * shape cannot express, so sections carry an ordered block list instead.
 */
'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';
import { DATA_POLICY } from './content';

export default function TratamientoDeDatosPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const t = DATA_POLICY[language] ?? DATA_POLICY.en;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid safe-area-top">
      <div className="bg-stone-200 dark:bg-tribe-dark p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </Button>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="dark:bg-tribe-dark shadow-none border-none">
          <CardContent className="p-8">
            <div className="space-y-6 text-stone-700 dark:text-gray-300">
              {/*
                Brand line, legal basis line, version line. Ordinary paragraphs
                above the first numbered section, per the approved layout.
              */}
              {t.intro.map((paragraph, i) => (
                <p key={i} className="mb-2">
                  {paragraph}
                </p>
              ))}

              {t.sections.map((section, i) => (
                <section key={i}>
                  <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">{section.heading}</h2>
                  {section.blocks.map((block, j) =>
                    block.kind === 'p' ? (
                      <p key={j} className="mb-2">
                        {block.text}
                      </p>
                    ) : (
                      <ul key={j} className="list-disc pl-6 space-y-1">
                        {block.items.map((item, k) => (
                          <li key={k}>{item}</li>
                        ))}
                      </ul>
                    )
                  )}
                </section>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
