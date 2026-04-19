'use client';

import { useLanguage } from '@/lib/LanguageContext';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import Accordion, { AccordionItem } from '@/components/marketing/Accordion';

interface FAQCategory {
  titleEn: string;
  titleEs: string;
  items: { qEn: string; qEs: string; aEn: string; aEs: string }[];
}

const categories: FAQCategory[] = [
  {
    titleEn: 'General',
    titleEs: 'General',
    items: [
      {
        qEn: 'What is Tribe?',
        qEs: '¿Qué es Tribe?',
        aEn: 'Tribe is a fitness marketplace that connects athletes and instructors in Medellín. Find training sessions, book with local instructors, and never train alone again.',
        aEs: 'Tribe es un marketplace fitness que conecta atletas e instructores en Medellín. Encuentra sesiones de entrenamiento, reserva con instructores locales y nunca entrenes solo de nuevo.',
      },
      {
        qEn: 'Is Tribe free to use?',
        qEs: '¿Tribe es gratis?',
        aEn: 'Tribe is free to download and browse. Athletes pay only when they book a session or purchase a product. Instructors keep 85% of every transaction.',
        aEs: 'Tribe es gratis para descargar y explorar. Los atletas pagan solo cuando reservan una sesión o compran un producto. Los instructores se quedan con el 85% de cada transacción.',
      },
      {
        qEn: 'What sports and activities are on Tribe?',
        qEs: '¿Qué deportes y actividades hay en Tribe?',
        aEn: 'Everything from weightlifting and yoga to running, cycling, martial arts, calisthenics, and more. If it gets you moving, you can find it on Tribe.',
        aEs: 'Desde levantamiento de pesas y yoga hasta running, ciclismo, artes marciales, calistenia y más. Si te pone en movimiento, lo puedes encontrar en Tribe.',
      },
      {
        qEn: 'Is Tribe only in Medellín?',
        qEs: '¿Tribe solo está en Medellín?',
        aEn: 'For now, yes. We are focused on building the best possible experience for Medellín before expanding to other cities in Colombia and Latin America.',
        aEs: 'Por ahora, sí. Estamos enfocados en construir la mejor experiencia posible para Medellín antes de expandirnos a otras ciudades de Colombia y Latinoamérica.',
      },
      {
        qEn: 'How is Tribe different from ClassPass?',
        qEs: '¿En qué se diferencia Tribe de ClassPass?',
        aEn: 'ClassPass connects you to gyms and studios. Tribe connects you to people. Our focus is on community-driven fitness — real sessions with real athletes and instructors, not just gym access.',
        aEs: 'ClassPass te conecta con gimnasios y estudios. Tribe te conecta con personas. Nuestro enfoque es el fitness en comunidad — sesiones reales con atletas e instructores reales, no solo acceso a gimnasios.',
      },
    ],
  },
  {
    titleEn: 'For Athletes',
    titleEs: 'Para Atletas',
    items: [
      {
        qEn: 'How do I find sessions near me?',
        qEs: '¿Cómo encuentro sesiones cerca de mí?',
        aEn: 'Open Tribe, browse the session feed, or use the map view to find sessions nearby. Filter by sport, date, time, or instructor to find exactly what you need.',
        aEs: 'Abre Tribe, explora el feed de sesiones o usa la vista de mapa para encontrar sesiones cerca. Filtra por deporte, fecha, hora o instructor para encontrar exactamente lo que necesitas.',
      },
      {
        qEn: 'Can I connect with other athletes?',
        qEs: '¿Puedo conectar con otros atletas?',
        aEn: 'Yes. When you join a session, you can chat with other participants. Connections happen through shared training, not social media-style following.',
        aEs: 'Sí. Cuando te unes a una sesión, puedes chatear con otros participantes. Las conexiones suceden a través del entrenamiento compartido, no al estilo de redes sociales.',
      },
      {
        qEn: 'What are session packs?',
        qEs: '¿Qué son los paquetes de sesiones?',
        aEn: 'Session packs let you buy multiple sessions with an instructor at a discounted rate. It is a great way to commit to your training and save money.',
        aEs: 'Los paquetes de sesiones te permiten comprar varias sesiones con un instructor a un precio con descuento. Es una excelente manera de comprometerte con tu entrenamiento y ahorrar dinero.',
      },
      {
        qEn: 'Are sessions refundable?',
        qEs: '¿Las sesiones son reembolsables?',
        aEn: 'Cancellations made 24 hours or more before a session are fully refundable. Late cancellations are handled on a case-by-case basis by the instructor.',
        aEs: 'Las cancelaciones realizadas 24 horas o más antes de una sesión son completamente reembolsables. Las cancelaciones tardías se manejan caso por caso por el instructor.',
      },
      {
        qEn: 'What if a session is full?',
        qEs: '¿Qué pasa si una sesión está llena?',
        aEn: 'You can join the waitlist. If a spot opens up, you will be notified automatically. You can also message the instructor to ask about additional availability.',
        aEs: 'Puedes unirte a la lista de espera. Si se abre un cupo, serás notificado automáticamente. También puedes enviar un mensaje al instructor para preguntar por disponibilidad adicional.',
      },
    ],
  },
  {
    titleEn: 'For Instructors',
    titleEs: 'Para Instructores',
    items: [
      {
        qEn: 'How do I become an instructor on Tribe?',
        qEs: '¿Cómo me convierto en instructor en Tribe?',
        aEn: 'Sign up, select "Instructor" as your role, and complete your profile. You can start listing sessions immediately. No approval process required.',
        aEs: 'Regístrate, selecciona "Instructor" como tu rol y completa tu perfil. Puedes empezar a publicar sesiones inmediatamente. No se requiere proceso de aprobación.',
      },
      {
        qEn: 'What is the platform fee?',
        qEs: '¿Cuál es la comisión de la plataforma?',
        aEn: 'Tribe takes a 15% commission on each transaction. For your first 3 months, the fee is 0% — you keep 100% of everything you earn.',
        aEs: 'Tribe cobra una comisión del 15% por cada transacción. Durante tus primeros 3 meses, la comisión es 0% — te quedas con el 100% de todo lo que ganas.',
      },
      {
        qEn: 'Can I sell products on Tribe?',
        qEs: '¿Puedo vender productos en Tribe?',
        aEn: 'Yes. You can sell meal plans, workout programs, merchandise, and other fitness-related products directly through your instructor profile.',
        aEs: 'Sí. Puedes vender planes de comida, programas de entrenamiento, mercancía y otros productos relacionados con fitness directamente a través de tu perfil de instructor.',
      },
      {
        qEn: 'How do payouts work?',
        qEs: '¿Cómo funcionan los pagos?',
        aEn: 'Payouts are processed after each completed session and transferred to your registered bank account within 3-5 business days. Track everything in your dashboard.',
        aEs: 'Los pagos se procesan después de cada sesión completada y se transfieren a tu cuenta bancaria registrada en 3-5 días hábiles. Rastrea todo en tu panel.',
      },
      {
        qEn: 'Do I need my own gym or space?',
        qEs: '¿Necesito mi propio gimnasio o espacio?',
        aEn: 'No. Many instructors host sessions in parks, outdoor spaces, or shared facilities. You set the location for each session — it can be anywhere.',
        aEs: 'No. Muchos instructores realizan sesiones en parques, espacios al aire libre o instalaciones compartidas. Tú defines la ubicación de cada sesión — puede ser en cualquier lugar.',
      },
      {
        qEn: 'Can I set up recurring sessions?',
        qEs: '¿Puedo crear sesiones recurrentes?',
        aEn: 'Yes. When creating a session, you can set it to repeat weekly or on custom days. Athletes can subscribe to your recurring sessions for consistent training.',
        aEs: 'Sí. Al crear una sesión, puedes configurarla para que se repita semanalmente o en días personalizados. Los atletas pueden suscribirse a tus sesiones recurrentes para un entrenamiento constante.',
      },
    ],
  },
  {
    titleEn: 'Payments & Safety',
    titleEs: 'Pagos y Seguridad',
    items: [
      {
        qEn: 'How does payment processing work?',
        qEs: '¿Cómo funciona el procesamiento de pagos?',
        aEn: 'All payments are processed securely through our payment partner. Athletes pay at the time of booking, and instructors receive payouts after session completion.',
        aEs: 'Todos los pagos se procesan de forma segura a través de nuestro socio de pagos. Los atletas pagan al momento de la reserva y los instructores reciben sus pagos después de completar la sesión.',
      },
      {
        qEn: 'Is my personal information secure?',
        qEs: '¿Mi información personal está segura?',
        aEn: 'Yes. We use industry-standard encryption and never share your personal data with third parties. Your location is only shown at the session level, not your home address.',
        aEs: 'Sí. Usamos encriptación estándar de la industria y nunca compartimos tus datos personales con terceros. Tu ubicación solo se muestra a nivel de sesión, no tu dirección de casa.',
      },
      {
        qEn: 'How do refunds work?',
        qEs: '¿Cómo funcionan los reembolsos?',
        aEn: 'Refunds for cancellations made 24+ hours before a session are automatic. For other cases, contact the instructor directly or reach out to our support team.',
        aEs: 'Los reembolsos por cancelaciones realizadas 24+ horas antes de una sesión son automáticos. Para otros casos, contacta al instructor directamente o escríbenos a nuestro equipo de soporte.',
      },
      {
        qEn: 'Can I delete my account?',
        qEs: '¿Puedo eliminar mi cuenta?',
        aEn: 'Yes. You can delete your account at any time from your profile settings. All your personal data will be permanently removed within 30 days.',
        aEs: 'Sí. Puedes eliminar tu cuenta en cualquier momento desde la configuración de tu perfil. Todos tus datos personales serán eliminados permanentemente en un plazo de 30 días.',
      },
    ],
  },
];

export default function FAQPage() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <MarketingLayout fullBleed>
      {/* HERO */}
      <section className="pt-32 pb-12 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-black mb-4">
            {es ? 'Preguntas Frecuentes' : 'Frequently Asked Questions'}
          </h1>
          <p className="text-gray-400 text-lg">
            {es ? 'Todo lo que necesitas saber sobre Tribe.' : 'Everything you need to know about Tribe.'}
          </p>
        </div>
      </section>

      {/* FAQ SECTIONS */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto space-y-12">
          {categories.map((cat) => {
            const items: AccordionItem[] = cat.items.map((item) => ({
              question: es ? item.qEs : item.qEn,
              answer: es ? item.aEs : item.aEn,
            }));

            return (
              <div key={cat.titleEn}>
                <h2 className="text-2xl font-black mb-6">{es ? cat.titleEs : cat.titleEn}</h2>
                <Accordion items={items} />
              </div>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}
