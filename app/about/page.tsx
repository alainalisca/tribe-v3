'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import MarketingLayout from '@/components/marketing/MarketingLayout';

export default function AboutPage() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <MarketingLayout fullBleed>
      {/* HERO */}
      <section className="pt-32 pb-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-tribe-green font-semibold text-sm uppercase tracking-widest mb-4">
            {es ? 'Sobre Nosotros' : 'About Us'}
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight">
            {es
              ? 'Estamos Construyendo la Comunidad Fitness de Medellín'
              : "We're Building Medellín's Fitness Community"}
          </h1>
        </div>
      </section>

      {/* THE STORY */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto space-y-6 text-gray-400 leading-relaxed">
          {/* TODO: Al — rewrite this section in your own voice. This is YOUR story. */}
          <p>
            {es
              ? 'Tribe nació de una frustración simple: mudarse a una nueva ciudad y no tener con quién entrenar. Los gimnasios eran transaccionales, las apps de fitness eran solitarias y encontrar un compañero de entrenamiento significaba buscar en grupos de redes sociales.'
              : 'Tribe was born from a simple frustration: moving to a new city and having no one to train with. Gyms were transactional, fitness apps were lonely, and finding a training partner meant scrolling through social media groups.'}
          </p>
          <p>
            {es
              ? 'Medellín tiene una de las culturas fitness más vibrantes de América Latina. La gente entrena al aire libre, en parques, en estudios boutique, en canchas de barrio — pero no había una plataforma que los conectara a todos.'
              : 'Medellín has one of the most vibrant fitness cultures in Latin America. People train outdoors, in parks, in boutique studios, on neighborhood courts — but there was no platform connecting them all.'}
          </p>
          <p>
            {es
              ? 'Así que construimos uno. Tribe es donde los atletas encuentran sesiones, donde los instructores construyen sus negocios y donde la comunidad fitness de Medellín se reúne — no a través de likes o seguidores, sino a través de sesiones reales, sudor real y conexiones reales.'
              : "So we built one. Tribe is where athletes find sessions, where instructors build their businesses, and where Medellín's fitness community comes together — not through likes or followers, but through real sessions, real sweat, and real connections."}
          </p>
          <p>
            {es
              ? 'Apenas estamos comenzando. Y si estás leyendo esto, tú eres parte de la historia.'
              : "We're just getting started. And if you're reading this, you're part of the story."}
          </p>
        </div>
      </section>

      {/* FOUNDER CARD */}
      <section className="py-16 px-4 bg-tribe-surface">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* TODO: Al — add your real photo to public/images/al-alisca.jpg */}
            <div className="w-32 h-32 rounded-full bg-tribe-mid flex items-center justify-center text-3xl font-black text-gray-600 shrink-0">
              AA
            </div>
            <div>
              <h3 className="text-xl font-bold mb-1">Al Alisca</h3>
              <p className="text-tribe-green text-sm font-semibold mb-3">{es ? 'Fundador y CEO' : 'Founder & CEO'}</p>
              <p className="text-gray-400 text-sm leading-relaxed">
                {es
                  ? 'Emprendedor fitness radicado en Medellín. Construyendo Tribe para resolver el problema que vivió en carne propia: encontrar gente con quien entrenar en una ciudad nueva.'
                  : 'Fitness entrepreneur based in Medellín. Building Tribe to solve the problem he lived firsthand: finding people to train with in a new city.'}
              </p>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-tribe-mid text-center">
            <p className="text-gray-400 mb-4">
              {es
                ? 'Tribe es construido por un equipo pequeño con grandes ambiciones para el fitness en Medellín.'
                : 'Tribe is built by a small team with big ambitions for fitness in Medellín.'}
            </p>
            <a
              href="mailto:support@tribe.fitness"
              className="text-tribe-green font-semibold hover:text-tribe-green-hover transition-colors"
            >
              {es ? 'Contáctanos' : 'Get In Touch'}
            </a>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">{es ? 'Nuestros Valores' : 'Our Values'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                titleEn: 'Show Up',
                titleEs: 'Preséntate',
                descEn:
                  'Consistency beats intensity. Tribe is built for the people who show up — rain or shine, Monday or Saturday.',
                descEs:
                  'La constancia vence a la intensidad. Tribe es para los que se presentan — llueva o truene, lunes o sábado.',
              },
              {
                titleEn: 'Train Together',
                titleEs: 'Entrena en Comunidad',
                descEn:
                  'Fitness is better with people. Every feature we build makes it easier to find someone to train with.',
                descEs:
                  'El fitness es mejor con gente. Cada función que construimos facilita encontrar con quién entrenar.',
              },
              {
                titleEn: 'Build Locally',
                titleEs: 'Construye Localmente',
                descEn:
                  "We're not trying to be everywhere. We're building something great for Medellín first — deep roots, real community.",
                descEs:
                  'No intentamos estar en todos lados. Estamos construyendo algo increíble para Medellín primero — raíces profundas, comunidad real.',
              },
            ].map((value) => (
              <div key={value.titleEn} className="bg-tribe-surface border border-tribe-mid rounded-xl p-6 text-center">
                <h3 className="text-xl font-bold mb-3">{es ? value.titleEs : value.titleEn}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{es ? value.descEs : value.descEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-4 bg-tribe-surface text-center">
        <div className="max-w-2xl md:max-w-4xl mx-auto">
          <h2 className="text-3xl font-black mb-4">
            {es ? '¿Quieres llevar Tribe a tu ciudad?' : 'Want to bring Tribe to your city?'}
          </h2>
          <p className="text-gray-400 mb-8">
            {es ? 'Estamos explorando la expansión. Escríbenos.' : "We're exploring expansion. Drop us a line."}
          </p>
          <a
            href="mailto:expand@tribe.fitness"
            className="inline-block px-8 py-4 bg-tribe-green text-tribe-dark font-bold rounded-lg text-lg hover:bg-tribe-green-hover transition-colors"
          >
            {es ? 'Escríbenos' : 'Get In Touch'}
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
