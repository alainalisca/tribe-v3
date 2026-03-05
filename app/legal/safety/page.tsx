/** Page: /legal/safety — Safety guidelines for meeting training partners */
'use client';

import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSafetyContent } from '../legalTranslations';

export default function SafetyPage() {
  const { language } = useLanguage();
  const t = getSafetyContent(language);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] safe-area-top">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/settings">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-[#272D34] rounded-xl p-8">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-6">
            <p className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">{t.warningTitle}</p>
            <p className="text-sm text-yellow-800 dark:text-yellow-300">{t.warningDesc}</p>
          </div>

          <div className="space-y-6 text-stone-700 dark:text-gray-300">
            {t.checklistSections.map((sec, i) => (
              <section key={i}>
                <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">{sec.heading}</h2>
                <ul className="space-y-2">
                  {sec.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="text-tribe-green font-bold">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">{t.redFlagsTitle}</h2>
              <ul className="space-y-2">
                {t.redFlags.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-500 font-bold">🚩</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">{t.reportingTitle}</h2>
              <p className="mb-3">{t.reportingDesc}</p>
              <ol className="list-decimal pl-6 space-y-2">
                {t.reportingSteps.map((step, i) => (
                  <li key={i}>
                    {i === 3 ? (
                      <>
                        {step}{' '}
                        <a href="mailto:admin@aplusfitnessllc.com" className="text-tribe-green hover:underline">
                          admin@aplusfitnessllc.com
                        </a>
                      </>
                    ) : (
                      step
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4">
                <h3 className="font-bold text-red-900 dark:text-red-200 mb-2">{t.emergencyTitle}</h3>
                <p className="text-red-800 dark:text-red-300">{t.emergencyDesc}</p>
                <p className="font-semibold text-red-900 dark:text-red-200 mt-2">Colombia: 123</p>
                <p className="font-semibold text-red-900 dark:text-red-200">USA: 911</p>
              </div>
            </section>

            <section>
              <div className="bg-lime-50 dark:bg-lime-900/20 border-l-4 border-lime-500 p-4">
                <p className="font-semibold text-lime-900 dark:text-lime-200 mb-2">{t.rememberLabel}</p>
                <p className="text-lime-800 dark:text-lime-300">{t.rememberText}</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
