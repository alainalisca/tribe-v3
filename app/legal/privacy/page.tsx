/** Page: /legal/privacy — Privacy Policy */
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';
import { getPrivacyContent } from '../legalTranslations';

export default function PrivacyPage() {
  const { language } = useLanguage();
  const t = getPrivacyContent(language);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid safe-area-top">
      <div className="bg-stone-200 dark:bg-tribe-dark p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="dark:bg-tribe-dark shadow-none border-none">
          <CardContent className="p-8">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t.lastUpdated}</p>

            <div className="space-y-6 text-stone-700 dark:text-gray-300">
              {t.sections.map((sec, i) => (
                <section key={i}>
                  <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">{sec.heading}</h2>
                  {sec.paragraphs.map((p, j) => (
                    <p key={j} className="mb-2">
                      {p}
                    </p>
                  ))}
                  {sec.list && (
                    <ul className="list-disc pl-6 space-y-1">
                      {sec.list.map((item, k) => (
                        <li key={k}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {sec.highlight && (
                    <div className="bg-lime-50 dark:bg-lime-900/20 border-l-4 border-lime-500 p-4 mt-4">
                      <p className="font-semibold text-lime-900 dark:text-lime-200">{sec.highlight}</p>
                    </div>
                  )}
                  {sec.contact && (
                    <div className="bg-gray-100 dark:bg-tribe-mid p-4 rounded-lg">
                      <p>{sec.contactLabel}</p>
                      <p className="font-semibold mt-2">
                        Email:{' '}
                        <a href="mailto:admin@aplusfitnessllc.com" className="text-tribe-green hover:underline">
                          admin@aplusfitnessllc.com
                        </a>
                      </p>
                      <p className="text-sm mt-2">{t.businessName}</p>
                    </div>
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
