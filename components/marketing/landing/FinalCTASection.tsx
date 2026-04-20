'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const BG_PHOTO = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1400&q=80'; // gym/training wide shot

const t = {
  en: {
    heading: 'Ready to Join Tribe?',
    sub: 'Download the app or sign up on web. Your next training partner is one tap away.',
    ctaApp: 'Get the App',
    ctaWeb: 'Sign Up on Web',
    appStore: 'Download on the',
    playStore: 'GET IT ON',
  },
  es: {
    heading: '¿Listo para Unirte al Tribe?',
    sub: 'Descarga la app o regístrate en la web. Tu próximo compañero de entrenamiento está a un tap.',
    ctaApp: 'Descarga la App',
    ctaWeb: 'Regístrate en la Web',
    appStore: 'Descargar en',
    playStore: 'DISPONIBLE EN',
  },
} as const;

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
const APP_STORE = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';

export default function FinalCTASection() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal(0.2);

  return (
    <section ref={ref} className="relative py-24 px-4 overflow-hidden">
      {/* Background photo with overlay */}
      <div className="absolute inset-0">
        <Image src={BG_PHOTO} alt="" fill className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-tribe-dark/85 backdrop-blur-[2px]" />
        {/* Green glow */}
        <div className="absolute w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(192,232,99,0.08)_0%,transparent_70%)] -bottom-40 right-0 rounded-full animate-[pulseGlow_6s_ease-in-out_infinite]" />
      </div>

      <div
        className={`relative z-10 max-w-3xl mx-auto text-center transition-all duration-700 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">{s.heading}</h2>
        <p className="text-base sm:text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">{s.sub}</p>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <Link
            href="/auth"
            className="px-8 py-4 bg-tribe-green text-slate-900 font-bold rounded-xl text-base shadow-[0_4px_20px_rgba(192,232,99,0.3)] hover:shadow-[0_6px_28px_rgba(192,232,99,0.45)] hover:-translate-y-0.5 transition-all"
          >
            {s.ctaWeb}
          </Link>
        </div>

        {/* Store badges */}
        <div className="flex gap-3 justify-center">
          <a
            href={APP_STORE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 bg-black/80 text-white px-4 py-2 rounded-[10px] border border-white/20 hover:-translate-y-0.5 hover:shadow-lg transition-all min-h-[48px]"
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
            className="inline-flex items-center gap-2.5 bg-black/80 text-white px-4 py-2 rounded-[10px] border border-white/20 hover:-translate-y-0.5 hover:shadow-lg transition-all min-h-[48px]"
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
    </section>
  );
}
