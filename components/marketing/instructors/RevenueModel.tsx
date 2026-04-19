'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function RevenueModel() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <section className="py-20 px-4 bg-tribe-surface">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-black mb-4">
          {es ? 'Quédate con el ' : 'Keep '}
          <span className="text-tribe-green">85%</span>
          {es ? ' de Todo' : ' of Everything'}
        </h2>
        <p className="text-gray-400 mb-12 max-w-lg mx-auto">
          {es
            ? 'Sin tarifas ocultas. Sin suscripciones mensuales. Solo una comisión simple por transacción.'
            : 'No hidden fees. No monthly subscriptions. Just a simple per-transaction commission.'}
        </p>

        {/* Visual breakdown */}
        <div className="bg-tribe-dark rounded-2xl p-8 max-w-md mx-auto">
          <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">
            {es ? 'Ejemplo: Sesión de $30,000 COP' : 'Example: $30,000 COP Session'}
          </p>

          {/* Bar */}
          <div className="flex rounded-lg overflow-hidden h-12 mb-6">
            <div
              className="bg-tribe-green flex items-center justify-center text-tribe-dark font-bold text-sm"
              style={{ width: '85%' }}
            >
              $25,500
            </div>
            <div
              className="bg-tribe-mid flex items-center justify-center text-gray-400 font-medium text-sm"
              style={{ width: '15%' }}
            >
              $4,500
            </div>
          </div>

          <div className="flex justify-between text-sm">
            <div>
              <span className="text-tribe-green font-bold">85%</span>{' '}
              <span className="text-gray-400">{es ? 'Para Ti' : 'To You'}</span>
            </div>
            <div>
              <span className="text-gray-500 font-bold">15%</span>{' '}
              <span className="text-gray-400">{es ? 'Para Tribe' : 'To Tribe'}</span>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-tribe-mid">
            <p className="text-tribe-green font-bold text-lg">
              {es ? 'Primeros 3 meses: 0% comisión' : 'First 3 months: 0% fee'}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {es ? 'Quédate con el 100% mientras empiezas.' : 'Keep 100% while you get started.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
