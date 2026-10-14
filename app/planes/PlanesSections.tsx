'use client';

/**
 * T-PLAN1 part C: the presentational sections of /planes. Mobile-first: every
 * section is designed at 375px and only widens on md/lg.
 */

import Image from 'next/image';
import { MessageCircle, Plus } from 'lucide-react';
import Reveal from './Reveal';
import { PROOF_COACHES, type PlanesCopy } from './planesCopy';

const enter =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:fill-mode-both';

export function PlanesHero({ c }: { c: PlanesCopy }) {
  return (
    <section className="max-w-6xl mx-auto px-4 pt-2 pb-10 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pt-8 lg:pb-16">
      {/* One real coach mid-class. The crop keeps his face in the upper third at
          every width (object-position), and the student faces away from camera. */}
      <div
        className={`relative overflow-hidden rounded-3xl aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] lg:order-2 ${enter}`}
      >
        <Image
          src="/planes/hero-square.jpg"
          alt={c.heroPhotoAlt}
          fill
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-cover object-[64%_18%] motion-safe:transition-transform motion-safe:duration-[1200ms] motion-safe:hover:scale-[1.03]"
        />
      </div>

      <div className="mt-7 lg:mt-0 lg:order-1">
        <h1
          className={`text-[2.6rem] leading-[1.02] sm:text-6xl font-extrabold tracking-tighter text-tribe-dark ${enter} motion-safe:delay-150`}
        >
          {c.heroTitleA}
          <span className="block text-tribe-green-dark">{c.heroTitleB}</span>
        </h1>
        <p className={`mt-4 text-lg text-tribe-dark-80 max-w-md ${enter} motion-safe:delay-300`}>{c.heroSub}</p>
        <a
          href="#planes"
          className={`mt-7 inline-flex items-center justify-center rounded-2xl bg-tribe-dark px-7 py-4 text-base font-bold text-white transition hover:bg-tribe-dark-80 motion-safe:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tribe-green ${enter} motion-safe:delay-500`}
        >
          {c.heroCta}
        </a>
      </div>
    </section>
  );
}

export function PlanesProof({ c }: { c: PlanesCopy }) {
  return (
    <section className="max-w-6xl mx-auto px-4 pb-14">
      <Reveal>
        <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-tribe-dark-80">{c.proofTitle}</h2>
      </Reveal>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 md:max-w-xl">
        {PROOF_COACHES.map((coach, i) => (
          <Reveal key={coach.name} delayMs={i * 120}>
            <figure className="group">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-tribe-dark-40">
                <Image
                  src={coach.photo}
                  alt={coach.alt}
                  fill
                  sizes="(min-width: 768px) 280px, 50vw"
                  className="object-cover object-top motion-safe:transition-transform motion-safe:duration-700 motion-safe:group-hover:scale-105"
                />
              </div>
              <figcaption className="mt-2">
                <span className="block text-base font-extrabold text-tribe-dark">{coach.name}</span>
                <span className="block text-sm text-tribe-dark-80">
                  {coach.discipline} · {coach.place}
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function PlanesSteps({ c }: { c: PlanesCopy }) {
  return (
    <section className="max-w-6xl mx-auto px-4 py-14">
      <Reveal>
        <h2 className="text-3xl font-extrabold tracking-tight text-tribe-dark">{c.stepsTitle}</h2>
      </Reveal>
      <ol className="mt-8 space-y-8 md:grid md:grid-cols-3 md:gap-10 md:space-y-0">
        {c.steps.map((step, i) => (
          <Reveal key={step.title} delayMs={i * 120}>
            <li className="flex gap-4 md:block">
              <span className="text-5xl font-extrabold leading-none tracking-tighter text-tribe-green tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="md:mt-4">
                <h3 className="text-xl font-extrabold text-tribe-dark">{step.title}</h3>
                <p className="mt-1 text-tribe-dark-80">{step.body}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export function PlanesFaq({ c, whatsappHref }: { c: PlanesCopy; whatsappHref: string | null }) {
  return (
    <section className="max-w-3xl mx-auto px-4 py-14">
      <Reveal>
        <h2 className="text-3xl font-extrabold tracking-tight text-tribe-dark">{c.faqTitle}</h2>
      </Reveal>
      <div className="mt-6 divide-y divide-tribe-dark-60/50 border-y border-tribe-dark-60/50">
        {c.faqs.map((f) => (
          <details key={f.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold text-tribe-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-tribe-green rounded-lg [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus
                className="h-5 w-5 flex-shrink-0 text-tribe-dark-80 motion-safe:transition-transform motion-safe:duration-300 group-open:rotate-45"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 text-tribe-dark-80 leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
      {whatsappHref && (
        <Reveal className="mt-8 rounded-3xl bg-tribe-dark-40 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <p className="text-lg font-extrabold text-tribe-dark">{c.questions}</p>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 sm:mt-0 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 py-4 font-bold text-tribe-dark transition hover:brightness-95 motion-safe:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tribe-dark"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {c.talkToAl}
          </a>
        </Reveal>
      )}
    </section>
  );
}
