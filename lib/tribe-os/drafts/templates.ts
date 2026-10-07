export type DraftCase =
  | 'plan_expired'
  | 'plan_expiring'
  | 'came_back'
  | 'absent'
  | 'visiting_less'
  | 'new_not_coming'
  | 'generic';

export interface DraftContext {
  memberId: string;
  memberName: string | null;
  phone: string | null;
  reasons: string[];
  daysSinceLastActivity: number | null;
  lastActivityAt: string | null;
  lastTouchCreatedAt: string | null;
  cameBack?: boolean;
  coachName?: string;
  language: 'en' | 'es';
}

export interface Draft {
  text: string;
  case: DraftCase;
  variantIndex: number;
}

interface TemplateEntry {
  es: string;
  en: string;
}

const TEMPLATES: Record<DraftCase, TemplateEntry[]> = {
  plan_expired: [
    {
      es: 'Hola {name}, vi que tu plan venció hace {days} días. ¿Te gustaría renovar? Puedo guardarte tu horario de siempre.',
      en: 'Hey {name}, I noticed your plan expired {days} days ago. Want to renew? I can hold your usual schedule.',
    },
    {
      es: 'Hola {name}, tu plan ya venció y no quiero que pierdas el ritmo. ¿Hablamos de la renovación esta semana?',
      en: "Hey {name}, your plan expired and I don't want you to lose momentum. Can we talk about renewing this week?",
    },
    {
      es: 'Hola {name}, noté que tu plan venció. Si quieres seguir con nosotros, cuéntame y te ayudo con la renovación.',
      en: 'Hey {name}, I saw your plan expired. If you want to keep going, let me know and I can help with the renewal.',
    },
  ],
  plan_expiring: [
    {
      es: 'Hola {name}, tu plan vence pronto. ¿Quieres que te lo renueve para que no pierdas tu cupo?',
      en: "Hey {name}, your plan is expiring soon. Want me to renew it so you don't lose your spot?",
    },
    {
      es: 'Hola {name}, te aviso que tu plan está por vencer. ¿Lo renovamos para que sigas sin parar?',
      en: 'Hey {name}, heads up — your plan is about to expire. Shall we renew so you keep going?',
    },
    {
      es: 'Hola {name}, se acerca el vencimiento de tu plan. ¿Hablamos de la renovación antes de que se pase?',
      en: "Hey {name}, your plan's renewal date is coming up. Want to chat about it before it lapses?",
    },
  ],
  came_back: [
    {
      es: 'Hola {name}, qué bueno verte de vuelta. ¿Cómo te sentiste? Cualquier cosa que necesites, aquí estoy.',
      en: "Hey {name}, great to see you back! How did it feel? Whatever you need, I'm here.",
    },
    {
      es: 'Hola {name}, me alegra que hayas vuelto. ¿Todo bien con la clase? Avísame si quieres ajustar algo en tu plan.',
      en: 'Hey {name}, glad you came back. How was the class? Let me know if you want to adjust anything in your plan.',
    },
    {
      es: 'Hola {name}, genial que volviste. Espero que la hayas pasado bien. ¿Necesitas algo para esta semana?',
      en: 'Hey {name}, awesome that you came back. Hope you enjoyed it. Need anything for this week?',
    },
  ],
  absent: [
    {
      es: 'Hola {name}, llevas {days} días sin venir y te extrañamos. ¿Todo bien? Me encantaría verte esta semana.',
      en: "Hey {name}, it's been {days} days and we miss you. Everything okay? Would love to see you this week.",
    },
    {
      es: 'Hola {name}, hace {days} días que no te veo por el gym. ¿Estás bien? Cuéntame si puedo ayudarte con algo.',
      en: "Hey {name}, haven't seen you in {days} days. You okay? Let me know if I can help with anything.",
    },
    {
      es: 'Hola {name}, noté que llevas {days} días sin visitarnos. ¿Pasó algo? Aquí te esperamos cuando puedas.',
      en: "Hey {name}, I noticed it's been {days} days since your last visit. Everything alright? We're here whenever you're ready.",
    },
  ],
  visiting_less: [
    {
      es: 'Hola {name}, noté que has venido menos últimamente. ¿Todo bien? Si necesitas cambiar de horario, con gusto te ayudo.',
      en: "Hey {name}, I noticed you've been coming less lately. Everything okay? If you need a schedule change, happy to help.",
    },
    {
      es: 'Hola {name}, vi que tus visitas bajaron un poco. ¿Hay algo que pueda hacer para que sea más fácil venir?',
      en: 'Hey {name}, I saw your visits dropped a bit. Is there anything I can do to make it easier for you to come?',
    },
    {
      es: 'Hola {name}, te he visto menos por el gym. ¿Quieres que busquemos un horario que te funcione mejor?',
      en: "Hey {name}, I've seen you less at the gym. Want me to find a schedule that works better for you?",
    },
  ],
  new_not_coming: [
    {
      es: 'Hola {name}, ¿cómo vas? Noté que no has podido venir mucho. Si tienes dudas sobre clases u horarios, pregúntame.',
      en: "Hey {name}, how's it going? I noticed you haven't been able to come much. Any questions about classes or schedules, just ask.",
    },
    {
      es: 'Hola {name}, como eres nuevo quería saber cómo te va. ¿Necesitas ayuda para armar tu rutina o elegir clases?',
      en: "Hey {name}, since you're new I wanted to check in. Need help setting up a routine or picking classes?",
    },
    {
      es: 'Hola {name}, quería chequearte porque llevas poco tiempo con nosotros. ¿Hay algo que pueda hacer para que te sientas más cómodo?',
      en: "Hey {name}, wanted to check on you since you're still new. Is there anything I can do to help you feel more comfortable?",
    },
  ],
  generic: [
    {
      es: 'Hola {name}, pasaba a saludarte. ¿Cómo va todo? Cualquier cosa que necesites, aquí estoy.',
      en: "Hey {name}, just checking in. How's everything going? Whatever you need, I'm here.",
    },
    {
      es: 'Hola {name}, quería saber cómo vas. ¿Todo bien con el entrenamiento?',
      en: "Hey {name}, wanted to see how you're doing. Everything good with your training?",
    },
    {
      es: 'Hola {name}, hace rato no hablamos. ¿Cómo estás? Cuéntame si necesitas algo.',
      en: "Hey {name}, it's been a while since we talked. How are you? Let me know if you need anything.",
    },
  ],
};

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function firstName(name: string | null): string {
  if (!name) return '';
  return name.split(' ')[0];
}

export function selectCase(ctx: DraftContext): DraftCase {
  const r = ctx.reasons;

  const hasExpired = r.some((x) => x.includes('plan venció') || x.includes('Plan expired'));
  if (hasExpired) return 'plan_expired';

  const hasExpiring = r.some((x) => (x.includes('plan vence') || x.includes('Plan expires')) && !x.includes('venció'));
  if (hasExpiring) return 'plan_expiring';

  if (ctx.cameBack) return 'came_back';

  if (ctx.daysSinceLastActivity !== null && ctx.daysSinceLastActivity >= 14) return 'absent';

  const hasLess = r.some((x) => x.includes('menos que su promedio') || x.includes('less than average'));
  if (hasLess) return 'visiting_less';

  const isNew = r.some((x) => x.includes('Nuevo') || x.includes('New member') || x.includes('new'));
  if (isNew && ctx.daysSinceLastActivity !== null && ctx.daysSinceLastActivity >= 5) return 'new_not_coming';

  return 'generic';
}

export function pickVariant(memberId: string): number {
  return hashCode(memberId) % 3;
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export function renderDraft(ctx: DraftContext, variantOverride?: number): Draft {
  const draftCase = selectCase(ctx);
  const variantIndex = variantOverride ?? pickVariant(ctx.memberId);
  const entry = TEMPLATES[draftCase][variantIndex];
  const raw = ctx.language === 'es' ? entry.es : entry.en;

  const vars: Record<string, string> = {
    name: firstName(ctx.memberName),
    days: String(ctx.daysSinceLastActivity ?? ''),
    coach: ctx.coachName ?? '',
  };

  return {
    text: substitute(raw, vars),
    case: draftCase,
    variantIndex,
  };
}

export function cycleVariant(current: number): number {
  return (current + 1) % 3;
}
