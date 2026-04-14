'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const faqs = {
  en: [
    {
      q: 'Is Tribe free for athletes?',
      a: 'Yes. Creating an account and joining free community sessions costs nothing. Paid instructor sessions have a price set by the instructor.',
    },
    {
      q: 'How do instructors get paid?',
      a: 'Athletes pay through the app. Instructors receive 85% of every paid booking. The first 3 months have zero platform fees.',
    },
    {
      q: 'What sports are on Tribe?',
      a: 'CrossFit, running, yoga, cycling, calisthenics, HIIT, swimming, martial arts, and more. If you can train it, you can list it.',
    },
    {
      q: 'Is Tribe only in Medellín?',
      a: 'We launched in Medellín first. More cities in Colombia and Latin America are coming soon.',
    },
    {
      q: 'Can I message other athletes?',
      a: 'Chat is session-gated. You can message people you have trained with or are signed up to train with. No cold DMs.',
    },
  ],
  es: [
    {
      q: '¿Tribe es gratis para atletas?',
      a: 'Sí. Crear cuenta y unirte a sesiones comunitarias gratis no tiene costo. Las sesiones de instructores pagos tienen el precio que fije el instructor.',
    },
    {
      q: '¿Cómo cobran los instructores?',
      a: 'Los atletas pagan por la app. Los instructores reciben el 85% de cada reserva paga. Los primeros 3 meses no tienen comisión.',
    },
    {
      q: '¿Qué deportes hay en Tribe?',
      a: 'CrossFit, running, yoga, ciclismo, calistenia, HIIT, natación, artes marciales y más. Si se puede entrenar, se puede publicar.',
    },
    {
      q: '¿Tribe solo está en Medellín?',
      a: 'Lanzamos primero en Medellín. Pronto llegaremos a más ciudades en Colombia y Latinoamérica.',
    },
    {
      q: '¿Puedo escribirle a otros atletas?',
      a: 'El chat está vinculado a sesiones. Solo puedes hablar con personas con las que entrenaste o vas a entrenar. Sin mensajes fríos.',
    },
  ],
} as const;

const t = {
  en: { heading: 'Frequently Asked Questions', seeAll: 'See all FAQs' },
  es: { heading: 'Preguntas Frecuentes', seeAll: 'Ver todas las preguntas' },
} as const;

function AccordionItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/[0.08]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left text-white font-semibold text-sm sm:text-base hover:text-tribe-green transition-colors group"
      >
        <span>{question}</span>
        <span
          className={`ml-4 text-tribe-green text-lg shrink-0 transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
        >
          +
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-40 opacity-100 pb-5' : 'max-h-0 opacity-0'}`}
      >
        <p className="text-sm text-gray-400 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

export default function FAQPreviewSection() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal();

  return (
    <section id="faq-preview" className="bg-tribe-dark py-20 px-4">
      <div
        ref={ref}
        className={`max-w-3xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      >
        <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-12 tracking-tight">{s.heading}</h2>
        <div className="mb-8">
          {faqs[language].map((faq, i) => (
            <AccordionItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </div>
        <div className="text-center">
          <Link href="/faq" className="text-tribe-green font-semibold text-sm hover:underline">
            {s.seeAll} →
          </Link>
        </div>
      </div>
    </section>
  );
}
