'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { getPopularNeighborhoods } from '@/lib/city-config';

const PHOTOS = {
  hero: '/landing-hero.jpg',
  rowers: '/landing-rowers.jpg',
  deadlift: '/landing-deadlift.jpg',
  cycling: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=600&q=80',
  running: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&q=80',
};

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
const APP_STORE = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';

const t = {
  en: {
    headline1: 'Never Train',
    headline2: 'Alone',
    subtitle: 'Find sessions, join the community, train with real people in Medellín.',
    ctaAthlete: "I'm an Athlete",
    ctaInstructor: "I'm an Instructor",
    active: 'Active in 6+ neighborhoods across Medellín',
    appStore: 'Download on the',
    playStore: 'GET IT ON',
  },
  es: {
    headline1: 'Nunca Entrenes',
    headline2: 'Solo',
    subtitle: 'Encuentra sesiones, únete a la comunidad, entrena con gente real en Medellín.',
    ctaAthlete: 'Soy Atleta',
    ctaInstructor: 'Soy Instructor',
    active: 'Activo en 6+ barrios en Medellín',
    appStore: 'Descargar en',
    playStore: 'DISPONIBLE EN',
  },
} as const;

export default function HeroSection() {
  const { language } = useLanguage();
  const s = t[language];
  const neighborhoods = getPopularNeighborhoods();

  return (
    <section className="relative min-h-screen bg-tribe-dark overflow-hidden">
      {/* Animated glow */}
      <div className="absolute w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(192,232,99,0.12)_0%,transparent_70%)] -top-24 -left-24 rounded-full animate-[pulseGlow_6s_ease-in-out_infinite]" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-28 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text column */}
          <div className="text-center lg:text-left animate-[slideUp_0.8s_ease-out_both]">
            {/* Logo — single wordmark. Hero bg is always bg-tribe-dark, so the
                light-on-dark variant is always correct here. The previous layout
                rendered app-logo.png (a cropped wordmark) next to the wordmark,
                producing a duplicate "Tribe. Tribe." (QA-01). */}
            <div className="mb-10 flex items-center justify-center lg:justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/tribe-wordmark.png" alt="Tribe" className="h-16 lg:h-[72px] w-auto object-contain" />
            </div>

            <h1 className="font-black text-[clamp(40px,5vw,64px)] leading-[1.05] tracking-tight mb-5">
              {s.headline1}
              <br />
              <span className="text-tribe-green-light">{s.headline2}</span>
            </h1>

            <p className="text-lg text-gray-400 max-w-[480px] mb-9 mx-auto lg:mx-0 leading-relaxed animate-[slideUp_0.8s_0.15s_ease-out_both]">
              {s.subtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start mb-5 animate-[slideUp_0.8s_0.3s_ease-out_both]">
              <a
                href="#athletes"
                className="inline-flex items-center justify-center px-7 py-3.5 bg-tribe-green text-slate-900 font-bold rounded-xl shadow-[0_4px_20px_rgba(192,232,99,0.3)] hover:shadow-[0_6px_28px_rgba(192,232,99,0.45)] hover:-translate-y-0.5 transition-all"
              >
                {s.ctaAthlete}
              </a>
              <Link
                href="/for-instructors"
                className="inline-flex items-center justify-center px-7 py-3.5 border-2 border-tribe-green text-tribe-green font-bold rounded-xl hover:bg-tribe-green hover:text-slate-900 transition-all"
              >
                {s.ctaInstructor}
              </Link>
            </div>

            {/* Store badges */}
            <div className="flex gap-3 justify-center lg:justify-start animate-[slideUp_0.8s_0.45s_ease-out_both]">
              <a
                href={APP_STORE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-black text-white px-4 py-2 rounded-[10px] border border-white/20 hover:-translate-y-0.5 hover:shadow-lg transition-all min-h-[48px]"
              >
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-wide">{s.appStore}</span>
                  <span className="text-base font-semibold -tracking-tight">App Store</span>
                </div>
              </a>
              <a
                href={PLAY_STORE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 bg-black text-white px-4 py-2 rounded-[10px] border border-white/20 hover:-translate-y-0.5 hover:shadow-lg transition-all min-h-[48px]"
              >
                <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.61 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734c0-.382.218-.718.61-.92zM14.852 13.06l2.71 2.71-11.378 6.39 8.668-9.1zM21.41 10.89l-3.27 1.838-2.98-2.98 2.98-2.98 3.27 1.838c.93.522.93 1.762 0 2.284zM6.184 2.84l11.378 6.39-2.71 2.71-8.668-9.1z" />
                </svg>
                <div className="flex flex-col leading-tight">
                  <span className="text-[9px] uppercase tracking-wide">{s.playStore}</span>
                  <span className="text-base font-semibold -tracking-tight">Google Play</span>
                </div>
              </a>
            </div>
          </div>

          {/* Photo grid */}
          <div className="animate-[fadeIn_1s_0.4s_ease-out_both] order-first lg:order-last">
            <div className="grid grid-cols-2 gap-3 max-w-[520px] mx-auto">
              <div className="col-span-2 relative aspect-video rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                <Image
                  src={PHOTOS.hero}
                  alt="Barbell training in Medellín"
                  fill
                  className="object-cover object-[center_35%]"
                  priority
                />
              </div>
              <div className="relative aspect-square rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                <Image src={PHOTOS.rowers} alt="CrossFit community" fill className="object-cover object-top" />
              </div>
              <div className="relative aspect-square rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                <Image
                  src={PHOTOS.deadlift}
                  alt="Deadlift training"
                  fill
                  className="object-cover object-[center_30%]"
                />
              </div>
              <div className="relative aspect-square rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                <Image src={PHOTOS.cycling} alt="Cycling" fill className="object-cover" />
              </div>
              <div className="relative aspect-square rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                <Image src={PHOTOS.running} alt="Running" fill className="object-cover" />
              </div>
            </div>
          </div>
        </div>

        {/* Neighborhood pills */}
        <div className="mt-16 text-center animate-[slideUp_0.8s_0.6s_ease-out_both]">
          <div className="flex flex-wrap justify-center gap-2 mb-3">
            {neighborhoods.map((hood) => (
              <span
                key={hood.id}
                className="px-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-full text-sm text-gray-300 hover:bg-white/[0.1] transition-colors cursor-default"
              >
                {hood.emoji} {hood.name}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-500">{s.active}</p>
        </div>
      </div>
    </section>
  );
}
