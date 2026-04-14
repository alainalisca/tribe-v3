'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

/**
 * High-quality Unsplash photos showing real fitness scenes.
 * Each one anchors a feature block so the section isn't a wall of text.
 */
const FEATURE_IMAGES = {
  neighborhood: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80', // outdoor group training
  freePaid: 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=800&q=80', // gym/boxing training
  connect: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80', // people high-fiving after workout
};

const blocks = {
  en: [
    {
      image: FEATURE_IMAGES.neighborhood,
      alt: 'Group training outdoors in Medellín',
      title: 'Sessions by Neighborhood',
      desc: "Find what's happening in El Poblado, Laureles, Envigado, and more. Training sessions around the corner — not across town.",
    },
    {
      image: FEATURE_IMAGES.freePaid,
      alt: 'Boxing training session',
      title: 'Free and Paid Options',
      desc: 'Join free community sessions or book premium instructor-led coaching. First-timers often get promo codes.',
    },
    {
      image: FEATURE_IMAGES.connect,
      alt: 'Athletes connecting after a workout',
      title: 'Connect After You Train',
      desc: 'No cold DMs. Chat is session-gated — you build real relationships with people you actually trained with.',
    },
  ],
  es: [
    {
      image: FEATURE_IMAGES.neighborhood,
      alt: 'Entrenamiento grupal al aire libre en Medellín',
      title: 'Sesiones por Barrio',
      desc: 'Descubre qué pasa en El Poblado, Laureles, Envigado y más. Sesiones de entrenamiento a la vuelta de la esquina.',
    },
    {
      image: FEATURE_IMAGES.freePaid,
      alt: 'Sesión de boxeo',
      title: 'Opciones Gratis y Pagas',
      desc: 'Únete a sesiones comunitarias gratis o reserva coaching premium con instructores. Los nuevos suelen recibir códigos promo.',
    },
    {
      image: FEATURE_IMAGES.connect,
      alt: 'Atletas conectando después de entrenar',
      title: 'Conéctate Después de Entrenar',
      desc: 'Sin mensajes fríos. El chat está vinculado a sesiones — construyes relaciones reales con gente con la que entrenaste.',
    },
  ],
} as const;

const extras = {
  en: [
    {
      emoji: '🏃',
      title: 'Every Sport, One App',
      desc: 'CrossFit, running, yoga, cycling, calisthenics, HIIT, and more.',
    },
    {
      emoji: '🔥',
      title: 'Streaks & Challenges',
      desc: 'Stay consistent with training streaks and community challenges.',
    },
    { emoji: '🎟️', title: 'Promo Codes', desc: 'Instructors drop promos. First session is often free.' },
  ],
  es: [
    { emoji: '🏃', title: 'Cada Deporte, Una App', desc: 'CrossFit, running, yoga, ciclismo, calistenia, HIIT y más.' },
    {
      emoji: '🔥',
      title: 'Rachas y Retos',
      desc: 'Mantén la consistencia con rachas de entrenamiento y retos comunitarios.',
    },
    {
      emoji: '🎟️',
      title: 'Códigos Promo',
      desc: 'Los instructores comparten promos. La primera sesión suele ser gratis.',
    },
  ],
} as const;

const t = {
  en: { heading: 'Built for Athletes Who Show Up', cta: 'Start Training' },
  es: { heading: 'Hecho para Atletas que se Presentan', cta: 'Empieza a Entrenar' },
} as const;

function FeatureBlock({
  block,
  reverse,
  idx,
}: {
  block: { image: string; alt: string; title: string; desc: string };
  reverse: boolean;
  idx: number;
}) {
  const { ref, visible } = useScrollReveal(0.15);
  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 md:grid-cols-2 gap-8 items-center transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
      style={{ transitionDelay: `${idx * 100}ms` }}
    >
      {/* Image */}
      <div className={`relative aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ${reverse ? 'md:order-2' : ''}`}>
        <Image src={block.image} alt={block.alt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>
      {/* Text */}
      <div className={reverse ? 'md:order-1' : ''}>
        <h3 className="text-2xl sm:text-3xl font-black text-white mb-4 tracking-tight">{block.title}</h3>
        <p className="text-base text-gray-400 leading-relaxed max-w-md">{block.desc}</p>
      </div>
    </div>
  );
}

export default function ForAthletesSection() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref: headRef, visible: headVis } = useScrollReveal();

  return (
    <section id="athletes" className="bg-tribe-dark py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <h2
          ref={headRef}
          className={`text-3xl sm:text-4xl font-black text-white text-center mb-16 tracking-tight transition-all duration-700 ${
            headVis ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {s.heading}
        </h2>

        {/* Alternating image + text blocks */}
        <div className="flex flex-col gap-16 mb-16">
          {blocks[language].map((block, i) => (
            <FeatureBlock key={i} block={block} reverse={i % 2 === 1} idx={i} />
          ))}
        </div>

        {/* Small feature pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {extras[language].map((item, i) => (
            <div key={i} className="flex items-start gap-3 bg-white/[0.04] border border-white/[0.06] rounded-xl p-5">
              <span className="text-2xl">{item.emoji}</span>
              <div>
                <h4 className="text-sm font-bold text-white mb-1">{item.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/auth"
            className="inline-block px-8 py-3.5 bg-tribe-green text-tribe-dark font-bold rounded-xl shadow-[0_4px_20px_rgba(192,232,99,0.3)] hover:shadow-[0_6px_28px_rgba(192,232,99,0.45)] hover:-translate-y-0.5 transition-all"
          >
            {s.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
