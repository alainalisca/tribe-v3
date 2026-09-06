'use client';

import { useLanguage } from '@/lib/LanguageContext';

// PAY-01 layer 2: Tribe does not process, hold, or transfer money and takes no
// commission. The old version of this section rendered an 85/15 split bar, so
// the claim lived in the bar geometry and not only in the copy. The bar is now
// a single full width segment and the split is gone.
const copy = {
  en: {
    headingLead: 'Keep ',
    headingHighlight: '100%',
    headingTail: ' of What You Charge',
    sub: 'You set your price. Your students pay you directly. Tribe does not take a commission and does not touch your money.',
    example: 'A COP 30.000 session',
    legend: '100% to you',
    footer: 'Your students pay you by Nequi, transfer, or cash, the same way you work today.',
  },
  es: {
    headingLead: 'Te quedas con el ',
    headingHighlight: '100%',
    headingTail: ' de lo que cobras',
    sub: 'Tú pones tu precio. Tus estudiantes te pagan directo. Tribe no cobra comisión y no toca tu plata.',
    example: 'Una sesión de COP 30.000',
    legend: '100% para ti',
    footer: 'Tus estudiantes te pagan por Nequi, transferencia o efectivo, como ya trabajas hoy.',
  },
} as const;

export default function RevenueModel() {
  const { language } = useLanguage();
  const s = copy[language];

  return (
    <section className="py-20 px-4 bg-tribe-surface">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-black mb-4">
          {s.headingLead}
          <span className="text-tribe-green">{s.headingHighlight}</span>
          {s.headingTail}
        </h2>
        <p className="text-gray-400 mb-12 max-w-lg mx-auto">{s.sub}</p>

        {/* Visual breakdown */}
        <div className="bg-tribe-dark rounded-2xl p-8 max-w-md mx-auto">
          <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">{s.example}</p>

          {/* Bar: one full width segment. There is no platform cut to show. */}
          <div className="flex rounded-lg overflow-hidden h-12 mb-6">
            <div
              className="bg-tribe-green flex items-center justify-center text-tribe-dark font-bold text-sm"
              style={{ width: '100%' }}
            >
              COP 30.000
            </div>
          </div>

          <div className="flex justify-center text-sm">
            <div>
              <span className="text-tribe-green font-bold">{s.legend}</span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-tribe-mid">
            <p className="text-gray-500 text-sm">{s.footer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
