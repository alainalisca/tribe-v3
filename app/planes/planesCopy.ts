/**
 * T-PLAN1 part C: every string on /planes, Colombian Spanish and English.
 * One object per language (the /for-instructors pattern) so the page carries no
 * scattered ternaries. No em or en dashes anywhere in this copy.
 */

export interface PlanCopy {
  name: string;
  priceNote: string;
  bullets: string[];
  cta: string;
}

export interface PlanesCopy {
  title: string;
  subtitle: string;
  founding: string;
  perMonth: string;
  free: string;
  basico: PlanCopy;
  pro: PlanCopy;
  crecimiento: PlanCopy;
  embajador: string;
  currentPlan: string;
  manage: string;
  talkToAl: string;
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
    title: 'Planes para coaches y gimnasios',
    subtitle: 'Tu perfil y tus clases siguen gratis. Con un plan, más atletas te encuentran y Tribe trabaja contigo.',
    founding: 'Precio fundador',
    perMonth: '/ mes',
    free: 'Gratis',
    basico: {
      name: 'Básico',
      priceNote: 'Para siempre',
      bullets: ['Perfil de coach.', 'Publica tus clases.', 'Reservas y tus propios links de pago.'],
      cta: 'Publica una clase',
    },
    pro: {
      name: 'Coach Pro',
      priceNote: 'Para coaches independientes',
      bullets: [
        'Todo lo de Básico.',
        'Insignia Pro.',
        'Tus clases en "Coaches destacados".',
        'Una historia semanal de tu clase hecha por Tribe.',
        'Un post "Conoce a" al mes.',
        'Tus números del mes.',
      ],
      cta: 'Quiero Coach Pro',
    },
    crecimiento: {
      name: 'Tribe Crecimiento',
      priceNote: 'Para gimnasios y estudios',
      bullets: [
        'Todo lo de Coach Pro para tus coaches.',
        'Sesión de fotos y video mensual.',
        'Página de clase gratis con tu logo.',
        'Invitaciones personales cada semana.',
        'Reporte de resultados: quién fue invitado, quién reservó, quién llegó.',
      ],
      cta: 'Quiero Crecimiento',
    },
    embajador: 'Embajador Tribe',
    currentPlan: 'Tu plan actual',
    manage: 'Gestionar suscripción',
    talkToAl: 'Hablar con Al',
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
    title: 'Plans for coaches and gyms',
    subtitle: 'Your profile and your classes stay free. With a plan, more athletes find you and Tribe works with you.',
    founding: 'Founding price',
    perMonth: '/ month',
    free: 'Free',
    basico: {
      name: 'Basic',
      priceNote: 'Forever',
      bullets: ['Coach profile.', 'Post your classes.', 'Bookings and your own payment links.'],
      cta: 'Post a class',
    },
    pro: {
      name: 'Coach Pro',
      priceNote: 'For independent coaches',
      bullets: [
        'Everything in Basic.',
        'Pro badge.',
        'Your classes in "Featured coaches".',
        'A weekly story of your class made by Tribe.',
        'A monthly "Meet" post about you.',
        'Your numbers for the month.',
      ],
      cta: 'Get Coach Pro',
    },
    crecimiento: {
      name: 'Tribe Crecimiento',
      priceNote: 'For gyms and studios',
      bullets: [
        'Everything in Coach Pro for your coaches.',
        'A monthly photo and video shoot.',
        'A free class page with your logo.',
        'Personal invitations every week.',
        'Results report: who was invited, who booked, who showed up.',
      ],
      cta: 'Get Crecimiento',
    },
    embajador: 'Tribe Ambassador',
    currentPlan: 'Your current plan',
    manage: 'Manage subscription',
    talkToAl: 'Talk to Al',
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
