/**
 * T-PLAN1 part C: every string on /planes. Spanish is the main language; the
 * English mirrors it. Plan names stay as Al set them (renaming comes later).
 * No em or en dashes anywhere in this copy.
 */

export interface PlanCopy {
  name: string;
  forWho: string;
  benefits: string[];
}

export interface Step {
  title: string;
  body: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface PlanesCopy {
  heroTitleA: string;
  heroTitleB: string;
  heroSub: string;
  heroCta: string;
  heroPhotoAlt: string;
  proofTitle: string;
  plansTitle: string;
  plansSub: string;
  founding: string;
  recommended: string;
  perMonth: string;
  free: string;
  forever: string;
  start: string;
  basico: PlanCopy;
  pro: PlanCopy;
  crecimiento: PlanCopy;
  embajador: string;
  currentPlan: string;
  manage: string;
  stepsTitle: string;
  steps: Step[];
  faqTitle: string;
  faqs: Faq[];
  questions: string;
  talkToAl: string;
  whatsappText: string;
  footer: string;
  instructorsOnly: string;
  becomeInstructor: string;
  successBanner: string;
  canceledBanner: string;
  errorGeneric: string;
  priceUnavailable: string;
  working: string;
  compBanner: (plan: string) => string;
}

export const planesCopy: Record<'es' | 'en', PlanesCopy> = {
  es: {
    heroTitleA: 'Llena tus clases.',
    heroTitleB: 'Nosotros te ayudamos.',
    heroSub: 'Tu perfil y tus clases en Tribe siempre son gratis.',
    heroCta: 'Ver planes',
    heroPhotoAlt: 'Coach de Tribe dirigiendo una clase de boxeo con manoplas al aire libre en Medellín',
    proofTitle: 'Coaches que ya crecen con Tribe',
    plansTitle: 'Elige tu plan',
    plansSub: 'Precio fundador para los primeros coaches. Cancela cuando quieras.',
    founding: 'Precio fundador',
    recommended: 'Recomendado',
    perMonth: 'COP / mes',
    free: 'Gratis',
    forever: 'Para siempre',
    start: 'Empezar',
    basico: {
      name: 'Básico',
      forWho: 'Para empezar',
      benefits: ['Tu perfil de coach', 'Publica tus clases', 'Reservas y tus propios links de pago'],
    },
    pro: {
      name: 'Coach Pro',
      forWho: 'Para coaches independientes',
      benefits: [
        'Tus clases salen primero en Tribe',
        'Una historia de tu clase cada semana, hecha por nosotros',
        'Tu post Conoce a cada mes',
        'Tus números del mes',
      ],
    },
    crecimiento: {
      name: 'Tribe Crecimiento',
      forWho: 'Para gimnasios y estudios',
      benefits: [
        'Todo lo de Coach Pro para tus coaches',
        'Sesión de fotos y video cada mes',
        'Tu página de clase gratis con tu logo',
        'Invitaciones personales cada semana',
        'Reporte: quién fue invitado, quién reservó, quién llegó',
      ],
    },
    embajador: 'Embajador Tribe',
    currentPlan: 'Tu plan actual',
    manage: 'Gestionar suscripción',
    stepsTitle: 'Cómo funciona',
    steps: [
      { title: 'Eliges tu plan', body: 'Coach Pro si das clases tú, Crecimiento si tienes gimnasio o estudio.' },
      { title: 'Pagas con tarjeta', body: 'Pago mensual seguro. Sin contratos, cancelas cuando quieras.' },
      { title: 'Empezamos esta semana', body: 'Te escribimos para agendar tu primera historia y tu post.' },
    ],
    faqTitle: 'Preguntas frecuentes',
    faqs: [
      {
        q: '¿Puedo cancelar cuando quiera?',
        a: 'Sí. Cancelas tú mismo desde "Gestionar suscripción", sin llamadas ni permanencia. Tu plan sigue activo hasta el final del mes que pagaste.',
      },
      {
        q: '¿Tribe cobra comisión por mis clases?',
        a: 'No. Tribe no cobra comisión por tus clases. Tus alumnos te pagan a ti, con tus propios links de pago.',
      },
      {
        q: '¿Qué significa "precio fundador"?',
        a: 'Es el precio para los primeros coaches que se unen. Mientras mantengas tu plan activo, tu precio queda fijo, aunque el precio público suba.',
      },
    ],
    questions: '¿Tienes otra pregunta?',
    talkToAl: 'Escríbele a Al por WhatsApp',
    whatsappText: 'Hola Al, tengo una pregunta sobre los planes de Tribe.',
    footer: 'Cancela cuando quieras. Tribe no cobra comisión por tus clases.',
    instructorsOnly: 'Los planes son para coaches y gimnasios. Activa tu perfil de instructor para continuar.',
    becomeInstructor: 'Activar perfil de instructor',
    successBanner: '¡Gracias! Recibimos tu pago. Tu plan se activa en unos segundos.',
    canceledBanner: 'No se hizo ningún cobro. Puedes elegir un plan cuando quieras.',
    errorGeneric: 'Algo salió mal. Intenta de nuevo en un momento.',
    priceUnavailable: 'Precio disponible pronto',
    working: 'Un momento...',
    compBanner: (plan) => `Tienes ${plan} como regalo de Tribe. No tienes que pagar nada.`,
  },
  en: {
    heroTitleA: 'Fill your classes.',
    heroTitleB: 'We help you do it.',
    heroSub: 'Your profile and your classes on Tribe are always free.',
    heroCta: 'See plans',
    heroPhotoAlt: 'Tribe coach leading an outdoor boxing pad-work class in Medellín',
    proofTitle: 'Coaches already growing with Tribe',
    plansTitle: 'Choose your plan',
    plansSub: 'Founding price for the first coaches. Cancel anytime.',
    founding: 'Founding price',
    recommended: 'Recommended',
    perMonth: 'COP / month',
    free: 'Free',
    forever: 'Forever',
    start: 'Start',
    basico: {
      name: 'Básico',
      forWho: 'To get started',
      benefits: ['Your coach profile', 'Post your classes', 'Bookings and your own payment links'],
    },
    pro: {
      name: 'Coach Pro',
      forWho: 'For independent coaches',
      benefits: [
        'Your classes show up first on Tribe',
        'A story of your class every week, made by us',
        'Your Conoce a post every month',
        'Your numbers for the month',
      ],
    },
    crecimiento: {
      name: 'Tribe Crecimiento',
      forWho: 'For gyms and studios',
      benefits: [
        'Everything in Coach Pro for your coaches',
        'A photo and video shoot every month',
        'Your free class page with your logo',
        'Personal invitations every week',
        'Report: who was invited, who booked, who showed up',
      ],
    },
    embajador: 'Embajador Tribe',
    currentPlan: 'Your current plan',
    manage: 'Manage subscription',
    stepsTitle: 'How it works',
    steps: [
      {
        title: 'You choose your plan',
        body: 'Coach Pro if you teach yourself, Crecimiento if you run a gym or studio.',
      },
      { title: 'You pay by card', body: 'Secure monthly payment. No contracts, cancel whenever you want.' },
      { title: 'We start this week', body: 'We message you to schedule your first story and your post.' },
    ],
    faqTitle: 'Questions',
    faqs: [
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. You cancel yourself from "Manage subscription", no calls and no lock-in. Your plan stays active until the end of the month you paid for.',
      },
      {
        q: 'Does Tribe take a commission on my classes?',
        a: 'No. Tribe takes no commission on your classes. Your students pay you directly, with your own payment links.',
      },
      {
        q: 'What does "founding price" mean?',
        a: 'It is the price for the first coaches who join. As long as you keep your plan active, your price stays locked, even if the public price goes up.',
      },
    ],
    questions: 'Another question?',
    talkToAl: 'Message Al on WhatsApp',
    whatsappText: 'Hi Al, I have a question about the Tribe plans.',
    footer: 'Cancel anytime. Tribe takes no commission on your classes.',
    instructorsOnly: 'Plans are for coaches and gyms. Turn on your instructor profile to continue.',
    becomeInstructor: 'Turn on instructor profile',
    successBanner: 'Thank you! We received your payment. Your plan turns on in a few seconds.',
    canceledBanner: 'You were not charged. You can choose a plan whenever you like.',
    errorGeneric: 'Something went wrong. Please try again in a moment.',
    priceUnavailable: 'Price coming soon',
    working: 'One moment...',
    compBanner: (plan) => `You have ${plan} as a gift from Tribe. There is nothing to pay.`,
  },
};

/**
 * The proof strip. Real coaches, Al's own photos. LOCAL ONLY until each coach
 * has said yes: the images live in public/planes/, which is excluded from git on
 * Al's machine, and this list must not reach a pushed branch before then.
 */
export const PROOF_COACHES = [
  {
    name: 'Andrés',
    discipline: 'HYROX',
    place: 'BullBox',
    photo: '/planes/andres.jpg',
    alt: 'Andrés haciendo un front squat con barra frente a una pared roja',
  },
  {
    name: 'Salomón',
    discipline: 'Boxeo',
    place: 'Zona de Combate',
    photo: '/planes/salomon.jpg',
    alt: 'Salomón en la jaula con guantes de combate',
  },
] as const;
