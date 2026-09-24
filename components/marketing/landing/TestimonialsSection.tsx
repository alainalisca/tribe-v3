'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// TODO: Al, replace with real testimonials from actual users. Avatars are
// initials on purpose: no stock faces standing in for real people.
const testimonials = {
  en: [
    {
      quote:
        'I moved to Medellín and had no gym crew. Tribe connected me with a CrossFit group in Poblado my first week.',
      name: 'Sarah M.',
      role: 'Athlete',
      neighborhood: 'El Poblado',
    },
    {
      quote:
        'I went from posting on Instagram to getting 15 bookings a week through Tribe. The storefront page is a game changer.',
      name: 'Carlos R.',
      role: 'Instructor',
      neighborhood: 'Laureles',
    },
    {
      quote:
        'Free community runs on weekends, paid HIIT classes during the week. Tribe has something for every budget.',
      name: 'Daniela P.',
      role: 'Athlete',
      neighborhood: 'Envigado',
    },
  ],
  es: [
    {
      quote:
        'Me mudé a Medellín sin conocer a nadie. Tribe me conectó con un grupo de CrossFit en Poblado la primera semana.',
      name: 'Sarah M.',
      role: 'Atleta',
      neighborhood: 'El Poblado',
    },
    {
      quote:
        'Pasé de publicar en Instagram a recibir 15 reservas por semana con Tribe. La página de perfil cambió todo.',
      name: 'Carlos R.',
      role: 'Instructor',
      neighborhood: 'Laureles',
    },
    {
      quote: 'Carreras gratis los fines de semana, clases HIIT entre semana. Tribe tiene algo para cada presupuesto.',
      name: 'Daniela P.',
      role: 'Atleta',
      neighborhood: 'Envigado',
    },
  ],
} as const;

const t = {
  en: { heading: 'What the Tribe Is Saying' },
  es: { heading: 'Lo que Dice el Tribe' },
} as const;

export default function TestimonialsSection() {
  const { language } = useLanguage();
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section ref={ref} className="relative py-24 px-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/marketing/testimonials-bg.jpg)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#272D34]/95 via-[#272D34]/80 to-[#272D34]/95" />
      <div className="relative z-10 max-w-5xl mx-auto">
        <h2
          className={`text-3xl sm:text-4xl font-black text-white text-center mb-14 tracking-tight transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          {t[language].heading}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials[language].map((item, i) => (
            <div
              key={i}
              className={`group bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 flex flex-col hover:bg-white/[0.07] hover:-translate-y-1 transition-all duration-500 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${200 + i * 150}ms` }}
            >
              {/* Quote */}
              <div className="text-3xl text-tribe-green/40 font-serif mb-2 leading-none">&ldquo;</div>
              <p className="text-gray-300 text-sm leading-relaxed mb-6 flex-1">{item.quote}</p>
              {/* Person */}
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="w-10 h-10 rounded-full bg-tribe-green/15 ring-2 ring-tribe-green/30 flex items-center justify-center text-tribe-green font-bold text-sm"
                >
                  {item.name.charAt(0)}
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{item.name}</p>
                  <p className="text-xs text-tribe-green">
                    {item.role} · {item.neighborhood}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
