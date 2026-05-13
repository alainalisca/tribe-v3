'use client';

/**
 * Generic "coming soon" surface for `/os/*` nav items whose
 * functionality lands in a later mission. Keeps the IA whole — the
 * sidebar navigates somewhere real — without forcing us to ship a
 * half-built feature.
 *
 * Once a stub's real feature lands, delete the stub page that uses
 * this component (do not leave the import dangling).
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface ComingSoonPageProps {
  /** Localized title pair (EN / ES). */
  title: { en: string; es: string };
  /** One-sentence summary of what this surface will eventually do. */
  description: { en: string; es: string };
  /** Optional icon to show above the title. */
  Icon?: React.ComponentType<{ className?: string }>;
}

const labels = {
  en: { eyebrow: 'Coming next', backToDashboard: '← Back to dashboard' },
  es: { eyebrow: 'Próximamente', backToDashboard: '← Volver al panel' },
} as const;

export default function ComingSoonPage({ title, description, Icon }: ComingSoonPageProps) {
  const { language } = useLanguage();
  const s = labels[language];

  return (
    <div className="px-4 lg:px-8 py-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/dashboard"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backToDashboard}
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          {Icon ? (
            <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-tribe-green/15 text-tribe-dark flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </div>
          ) : null}
          <p className="text-xs font-bold uppercase tracking-wider text-tribe-green mb-2">{s.eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 mb-2">{title[language]}</h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-md mx-auto">{description[language]}</p>
        </div>
      </div>
    </div>
  );
}
