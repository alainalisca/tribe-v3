'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { Search, CreditCard, Dumbbell, Store, ClipboardList, Wallet, type LucideIcon } from 'lucide-react';

const tracks = {
  en: {
    heading: 'What is Tribe?',
    athlete: {
      label: 'For Athletes',
      steps: [
        {
          num: '01',
          Icon: Search,
          title: 'Browse sessions near you',
          desc: 'Filter by sport, neighborhood, price, and time.',
        },
        {
          num: '02',
          Icon: CreditCard,
          title: 'Book and pay in the app',
          desc: 'Secure payment via Wompi or Stripe. Free sessions too.',
        },
        {
          num: '03',
          Icon: Dumbbell,
          title: 'Train with your new tribe',
          desc: 'Show up, sweat, connect with people who show up too.',
        },
      ],
    },
    instructor: {
      label: 'For Instructors',
      steps: [
        {
          num: '01',
          Icon: Store,
          title: 'Create your storefront',
          desc: 'Set up your profile, list your specialties, show your ratings.',
        },
        {
          num: '02',
          Icon: ClipboardList,
          title: 'List sessions and products',
          desc: 'Set prices, schedules, and sell merch or training plans.',
        },
        {
          num: '03',
          Icon: Wallet,
          title: 'Get paid directly',
          desc: '85% goes to you. Track earnings in your dashboard.',
        },
      ],
    },
  },
  es: {
    heading: '¿Qué es Tribe?',
    athlete: {
      label: 'Para Atletas',
      steps: [
        {
          num: '01',
          Icon: Search,
          title: 'Busca sesiones cerca de ti',
          desc: 'Filtra por deporte, barrio, precio y horario.',
        },
        {
          num: '02',
          Icon: CreditCard,
          title: 'Reserva y paga en la app',
          desc: 'Pago seguro por Wompi o Stripe. También sesiones gratis.',
        },
        {
          num: '03',
          Icon: Dumbbell,
          title: 'Entrena con tu nuevo tribe',
          desc: 'Aparece, suda, conecta con gente que también se presenta.',
        },
      ],
    },
    instructor: {
      label: 'Para Instructores',
      steps: [
        {
          num: '01',
          Icon: Store,
          title: 'Crea tu perfil profesional',
          desc: 'Configura tu perfil, lista tus especialidades y muestra tus calificaciones.',
        },
        {
          num: '02',
          Icon: ClipboardList,
          title: 'Publica sesiones y productos',
          desc: 'Fija precios, horarios y vende mercancía o planes de entrenamiento.',
        },
        {
          num: '03',
          Icon: Wallet,
          title: 'Recibe pagos directos',
          desc: 'El 85% es para ti. Rastrea tus ingresos en tu dashboard.',
        },
      ],
    },
  },
} as const;

function StepCard({
  step,
  delay,
}: {
  step: { num: string; Icon: LucideIcon; title: string; desc: string };
  delay: number;
}) {
  const { ref, visible } = useScrollReveal(0.2);
  const { Icon } = step;
  return (
    <div
      ref={ref}
      className={`relative text-center p-8 rounded-2xl bg-white/[0.06] border border-white/[0.08] hover:-translate-y-1.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="absolute -top-2.5 right-4 font-black text-[100px] leading-none text-white/[0.04] pointer-events-none select-none">
        {step.num}
      </div>
      <div className="w-14 h-14 rounded-2xl bg-tribe-green/10 flex items-center justify-center mb-4 mx-auto">
        <Icon className="w-7 h-7 text-tribe-green" strokeWidth={2} />
      </div>
      <h3 className="font-black text-lg text-white mb-3 tracking-tight">{step.title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
    </div>
  );
}

export default function HowItWorksSection() {
  const { language } = useLanguage();
  const s = tracks[language];
  const { ref, visible } = useScrollReveal();

  return (
    <section id="how-it-works" className="relative py-24 px-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/marketing/howitworks-bg.jpg)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#272D34]/95 via-[#272D34]/80 to-[#272D34]/95" />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div
          ref={ref}
          className={`text-center mb-14 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <h2 className="font-black text-[clamp(28px,4vw,42px)] text-white tracking-tight mb-3">{s.heading}</h2>
        </div>

        {/* Athlete track */}
        <div className="mb-14">
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 bg-tribe-green/10 border border-tribe-green/30 rounded-full text-sm font-semibold text-tribe-green">
              {s.athlete.label}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {s.athlete.steps.map((step, i) => (
              <StepCard key={i} step={step} delay={i * 100} />
            ))}
          </div>
        </div>

        {/* Instructor track */}
        <div>
          <div className="text-center mb-8">
            <span className="inline-block px-4 py-1.5 bg-tribe-green/10 border border-tribe-green/30 rounded-full text-sm font-semibold text-tribe-green">
              {s.instructor.label}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {s.instructor.steps.map((step, i) => (
              <StepCard key={i} step={step} delay={i * 100} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
