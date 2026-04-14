'use client';

import { useLanguage } from '@/lib/LanguageContext';

const cards = [
  {
    icon: '🏋️',
    titleEn: 'Sessions',
    titleEs: 'Sesiones',
    descEn: 'One-on-one or group training sessions. Set your own price, schedule, and location.',
    descEs: 'Sesiones individuales o grupales. Pon tu propio precio, horario y ubicación.',
  },
  {
    icon: '📦',
    titleEn: 'Products',
    titleEs: 'Productos',
    descEn: 'Sell meal plans, workout programs, merchandise, or any digital product.',
    descEs: 'Vende planes de comida, programas de entrenamiento, mercancía o cualquier producto digital.',
  },
  {
    icon: '🎟️',
    titleEn: 'Session Packs',
    titleEs: 'Paquetes de Sesiones',
    descEn: 'Bundle multiple sessions at a discount. Athletes commit, you get predictable income.',
    descEs: 'Agrupa varias sesiones con descuento. Los atletas se comprometen, tú tienes ingresos predecibles.',
  },
];

export default function WhatYouCanSell() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-black text-center mb-12">{es ? 'Qué Puedes Vender' : 'What You Can Sell'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div key={card.titleEn} className="bg-tribe-surface border border-tribe-mid rounded-xl p-6 text-center">
              <div className="text-4xl mb-4">{card.icon}</div>
              <h3 className="text-xl font-bold mb-2">{es ? card.titleEs : card.titleEn}</h3>
              <p className="text-gray-400 text-sm">{es ? card.descEs : card.descEn}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
