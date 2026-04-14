'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface FAQItem {
  qEn: string;
  qEs: string;
  aEn: string;
  aEs: string;
}

const faqs: FAQItem[] = [
  {
    qEn: 'Do I need a certification to be an instructor?',
    qEs: '¿Necesito una certificación para ser instructor?',
    aEn: 'No formal certification is required to list sessions on Tribe. However, having relevant credentials helps build trust with athletes and may improve your visibility on the platform.',
    aEs: 'No se requiere certificación formal para publicar sesiones en Tribe. Sin embargo, tener credenciales relevantes ayuda a generar confianza con los atletas y puede mejorar tu visibilidad.',
  },
  {
    qEn: 'Can I offer free sessions?',
    qEs: '¿Puedo ofrecer sesiones gratis?',
    aEn: 'Yes! Free sessions are a great way to build your reputation and attract new athletes. You can set any session price to $0 COP and start building your community.',
    aEs: '¡Sí! Las sesiones gratuitas son una excelente manera de construir tu reputación y atraer nuevos atletas. Puedes poner cualquier sesión a $0 COP y empezar a construir tu comunidad.',
  },
  {
    qEn: 'How and when do I get paid?',
    qEs: '¿Cómo y cuándo recibo mi pago?',
    aEn: 'Payouts are processed after each completed session. Funds are transferred to your registered bank account within 3-5 business days. You can track all earnings in your instructor dashboard.',
    aEs: 'Los pagos se procesan después de cada sesión completada. Los fondos se transfieren a tu cuenta bancaria registrada en 3-5 días hábiles. Puedes rastrear todas tus ganancias en tu panel de instructor.',
  },
  {
    qEn: 'Can I sell physical or digital products?',
    qEs: '¿Puedo vender productos físicos o digitales?',
    aEn: 'Absolutely. You can list meal plans, workout programs, branded merchandise, supplements, or any fitness-related product. The same 85/15 revenue split applies to product sales.',
    aEs: 'Por supuesto. Puedes publicar planes de comida, programas de entrenamiento, mercancía, suplementos o cualquier producto relacionado con fitness. La misma división 85/15 aplica para ventas de productos.',
  },
];

export default function InstructorFAQ() {
  const { language } = useLanguage();
  const es = language === 'es';
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-black text-center mb-12">{es ? 'Preguntas Frecuentes' : 'FAQ for Instructors'}</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-tribe-surface border border-tribe-mid rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="font-semibold pr-4">{es ? faq.qEs : faq.qEn}</span>
                <ChevronDown
                  size={20}
                  className={`shrink-0 text-gray-500 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openIndex === i && (
                <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed">{es ? faq.aEs : faq.aEn}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
