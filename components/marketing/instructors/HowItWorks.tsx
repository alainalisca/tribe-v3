'use client';

import { useLanguage } from '@/lib/LanguageContext';

const steps = [
  {
    num: '01',
    titleEn: 'Sign Up',
    titleEs: 'Regístrate',
    descEn: 'Create your instructor profile in under 2 minutes.',
    descEs: 'Crea tu perfil de instructor en menos de 2 minutos.',
  },
  {
    num: '02',
    titleEn: 'List a Session',
    titleEs: 'Publica una Sesión',
    descEn: 'Set the sport, time, location, and price. Done.',
    descEs: 'Pon el deporte, hora, ubicación y precio. Listo.',
  },
  {
    num: '03',
    titleEn: 'Athletes Find You',
    titleEs: 'Los Atletas Te Encuentran',
    descEn: 'Athletes browse and book your sessions directly on Tribe.',
    descEs: 'Los atletas buscan y reservan tus sesiones directamente en Tribe.',
  },
  {
    num: '04',
    titleEn: 'Get Paid',
    titleEs: 'Recibe Tu Pago',
    descEn: 'Money hits your account after each completed session.',
    descEs: 'El dinero llega a tu cuenta después de cada sesión completada.',
  },
];

export default function HowItWorks() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <section className="py-20 px-4 bg-tribe-surface">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-black text-center mb-12">{es ? 'Cómo Funciona' : 'How It Works'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <div className="text-tribe-green font-black text-3xl mb-3">{step.num}</div>
              <h3 className="text-lg font-bold mb-2">{es ? step.titleEs : step.titleEn}</h3>
              <p className="text-gray-400 text-sm">{es ? step.descEs : step.descEn}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
