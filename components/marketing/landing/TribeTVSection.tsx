'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

/**
 * Tribe.TV on the landing page.
 *
 * The featured episode shows its own thumbnail until someone taps play. Only
 * then is the YouTube player mounted (privacy-enhanced youtube-nocookie host),
 * so the landing page never pays for YouTube's player script on first load.
 * Tapping an episode in the side list makes it the featured one.
 *
 * To add an episode: drop its thumbnail in /public/tribe-tv/ and add one entry
 * to EPISODES. The first entry is featured by default.
 */

const CHANNEL = 'https://www.youtube.com/@tribe-nunca-entrenes-solo';

type Episode = {
  id: string; // YouTube video id
  thumb: string;
  title: { en: string; es: string };
  meta: { en: string; es: string };
  alt: { en: string; es: string };
};

const EPISODES: Episode[] = [
  {
    id: 'uuR0852_RxA',
    thumb: '/tribe-tv/ep-wod-bullbox.jpg',
    title: {
      es: 'El WOD completo: coach y atleta en BullBox',
      en: 'The full WOD: coach and athlete at BullBox',
    },
    meta: { es: 'BullBox · CrossFit · Medellín', en: 'BullBox · CrossFit · Medellín' },
    alt: {
      es: 'Atleta levantando una barra en BullBox, portada del episodio El WOD completo',
      en: 'Athlete lifting a barbell at BullBox, cover of the episode The full WOD',
    },
  },
  {
    id: 'LJHYuu4_s4o',
    thumb: '/tribe-tv/ep-mma-zona.jpg',
    title: {
      es: 'Un viernes con el profe Wil: MMA al aire libre',
      en: 'A Friday with coach Wil: outdoor MMA',
    },
    meta: { es: 'Zona de Combate · MMA', en: 'Zona de Combate · MMA' },
    alt: {
      es: 'Sparring de MMA en un parque de Medellín',
      en: 'MMA sparring in a park in Medellín',
    },
  },
];

// Announced but not published yet. Shown greyed out, not clickable.
const UPCOMING = {
  thumb: '/landing-bullbox.jpg',
  title: { es: 'HYROX en BullBox', en: 'HYROX at BullBox' },
};

const t = {
  en: {
    intro: 'Full episodes with Tribe coaches and athletes, filmed at real sessions in Medellín.',
    subscribe: 'Subscribe',
    all: 'See all episodes',
    newEp: 'New episode',
    more: 'More episodes',
    soon: 'Coming soon',
    next: 'Next episode',
    play: 'Play episode',
  },
  es: {
    intro: 'Episodios completos con los coaches y atletas del Tribe, grabados en sesiones reales en Medellín.',
    subscribe: 'Suscríbete',
    all: 'Ver todos los episodios',
    newEp: 'Nuevo episodio',
    more: 'Más episodios',
    soon: 'Próximamente',
    next: 'Próximo episodio',
    play: 'Reproducir episodio',
  },
} as const;

function YouTubeMark() {
  return (
    <svg viewBox="0 0 28 20" className="w-6 h-[17px]" aria-hidden="true">
      <path
        fill="#FF0000"
        d="M27.4 3.1A3.5 3.5 0 0 0 24.9.6C22.7 0 14 0 14 0S5.3 0 3.1.6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9a3.5 3.5 0 0 0 2.5 2.5C5.3 20 14 20 14 20s8.7 0 10.9-.6a3.5 3.5 0 0 0 2.5-2.5C28 14.7 28 10 28 10s0-4.7-.6-6.9z"
      />
      <path fill="#fff" d="m11.2 14.3 7.3-4.3-7.3-4.3z" />
    </svg>
  );
}

function PlayIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 4v16l13-8z" />
    </svg>
  );
}

export default function TribeTVSection(): JSX.Element {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal(0.1);
  const [featuredId, setFeaturedId] = useState(EPISODES[0].id);
  const [playing, setPlaying] = useState(false);

  const featured = EPISODES.find((e) => e.id === featuredId) ?? EPISODES[0];
  const others = EPISODES.filter((e) => e.id !== featured.id);
  const isNewest = featured.id === EPISODES[0].id;

  const pick = (id: string) => {
    setFeaturedId(id);
    setPlaying(true);
  };

  return (
    <section id="tribe-tv" aria-label="Tribe.TV" className="relative overflow-hidden bg-[#1F242A] border-y border-white/[0.08] py-16 md:py-24 px-4">
      <div className="pointer-events-none absolute -right-44 top-10 w-[900px] h-[520px] bg-[radial-gradient(closest-side,rgba(132,204,22,0.10),transparent)]" />

      <div
        ref={ref}
        className={`relative max-w-[1200px] mx-auto md:px-2 transition-all duration-700 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div>
            <h2 className="font-extrabold text-[clamp(36px,4.4vw,52px)] leading-none tracking-[-0.03em] text-white">
              Tribe<span className="text-tribe-green">.</span>TV
            </h2>
            <p className="mt-3 text-[17px] text-gray-400 max-w-[46ch]">{s.intro}</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a
              href={`${CHANNEL}?sub_confirmation=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 bg-white text-[#0F0F0F] font-bold text-[15px] px-5 py-3 rounded-full hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.35)] transition-all"
            >
              <YouTubeMark />
              {s.subscribe}
            </a>
            <a
              href={`${CHANNEL}/videos`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-semibold text-gray-300 border-b border-white/25 pb-0.5 hover:text-white hover:border-tribe-green transition-colors"
            >
              {s.all}
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-7 items-start">
          {/* Featured player */}
          <div className="grid gap-4">
            <div className="relative aspect-video rounded-[20px] overflow-hidden bg-black shadow-[0_30px_70px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.06)]">
              {playing ? (
                <iframe
                  key={featured.id}
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube-nocookie.com/embed/${featured.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title={featured.title[language]}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={`${s.play}: ${featured.title[language]}`}
                  className="group absolute inset-0 w-full h-full cursor-pointer"
                >
                  <Image
                    src={featured.thumb}
                    alt={featured.alt[language]}
                    fill
                    sizes="(min-width: 1024px) 760px, 100vw"
                    className="object-cover transition-[transform,filter] duration-[1100ms] ease-out group-hover:scale-[1.035] group-hover:brightness-[0.92]"
                  />
                  <span className="absolute right-3.5 bottom-3.5 md:right-[22px] md:bottom-[22px] grid place-items-center w-[60px] h-[60px] md:w-[76px] md:h-[76px] rounded-full bg-tribe-green shadow-[0_12px_40px_rgba(132,204,22,0.45)] transition-transform group-hover:scale-[1.08]">
                    <span className="absolute -inset-2.5 rounded-full border-2 border-tribe-green-light/60 animate-[ttvRing_2.2s_ease-out_infinite] motion-reduce:animate-none" />
                    <PlayIcon className="w-6 h-6 md:w-[30px] md:h-[30px] ml-1 fill-slate-900" />
                  </span>
                </button>
              )}
            </div>

            <a
              href={`https://www.youtube.com/watch?v=${featured.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group block px-1"
            >
              {isNewest && (
                <span className="inline-flex items-center gap-2 mb-2.5 text-xs font-extrabold tracking-[0.08em] uppercase text-white bg-[rgba(15,18,22,0.7)] border border-white/[0.12] px-3 py-1.5 rounded-full">
                  <span className="w-[7px] h-[7px] rounded-full bg-tribe-green animate-pulse" />
                  {s.newEp}
                </span>
              )}
              <h3 className="text-[clamp(19px,1.8vw,24px)] font-extrabold leading-tight tracking-[-0.01em] text-white group-hover:text-tribe-green-light transition-colors">
                {featured.title[language]}
              </h3>
              <span className="block mt-1.5 text-sm text-gray-400">{featured.meta[language]}</span>
            </a>
          </div>

          {/* Side list */}
          <div className="grid gap-3.5">
            <span className="text-xs font-extrabold tracking-[0.14em] uppercase text-gray-400">{s.more}</span>

            {others.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => pick(ep.id)}
                className="group grid grid-cols-[42%_1fr] gap-3.5 items-center p-2.5 -mx-2.5 rounded-[14px] text-left hover:bg-white/[0.04] transition-colors"
              >
                <span className="relative aspect-video rounded-[10px] overflow-hidden bg-black">
                  <Image
                    src={ep.thumb}
                    alt={ep.alt[language]}
                    fill
                    sizes="200px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
                  />
                  <span className="absolute left-2 top-2 grid place-items-center w-[30px] h-[30px] rounded-full bg-[rgba(15,18,22,0.75)] backdrop-blur-sm">
                    <PlayIcon className="w-3 h-3 ml-0.5 fill-white" />
                  </span>
                </span>
                <span>
                  <span className="block text-[15px] font-bold leading-snug text-white">{ep.title[language]}</span>
                  <span className="block mt-1.5 text-[13px] text-gray-400">{ep.meta[language]}</span>
                </span>
              </button>
            ))}

            <div className="grid grid-cols-[42%_1fr] gap-3.5 items-center p-2.5 -mx-2.5" aria-label={s.next}>
              <span className="relative aspect-video rounded-[10px] overflow-hidden bg-black">
                <Image src={UPCOMING.thumb} alt="" fill sizes="200px" className="object-cover grayscale brightness-[0.45]" />
                <span className="absolute inset-0 grid place-items-center text-[11px] font-extrabold tracking-[0.14em] uppercase text-tribe-green-light">
                  {s.soon}
                </span>
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-snug text-white">{UPCOMING.title[language]}</span>
                <span className="block mt-1.5 text-[13px] text-gray-400">{s.next}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
