export type DraftCase =
  | 'plan_expired'
  | 'plan_expiring'
  | 'came_back_expired'
  | 'came_back_active'
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
  coachName?: string | null;
  className?: string | null;
  classStartTime?: string | null;
  planEndsOn?: string | null;
  loggedInCoachName?: string | null;
  language: 'en' | 'es';
}

export interface Draft {
  text: string;
  case: DraftCase;
  variantIndex: number;
}

export const COMPOUND_FIRST_NAMES = [
  'Juan Esteban',
  'Juan David',
  'Juan Camilo',
  'Juan Pablo',
  'Juan José',
  'Juan Sebastián',
  'Juan Diego',
  'Juan Felipe',
  'Juan Manuel',
  'Juan Carlos',
  'Juan Andrés',
  'María Fernanda',
  'María José',
  'María Camila',
  'María Alejandra',
  'María Paula',
  'Ana María',
  'Ana Sofía',
  'Andrés Felipe',
  'Luis Fernando',
  'Luis Carlos',
  'Carlos Andrés',
  'Laura Camila',
  'Laura Sofía',
  'José Luis',
  'Miguel Ángel',
];

type TemplateEntry = { es: string; en: string };

const TEMPLATES: Record<DraftCase, TemplateEntry[]> = {
  plan_expired: [
    {
      es: '¡Hola {name}! ¿Cómo vas? Hace rato no te vemos{classRef}. Te guardo tu horario de siempre, ¿te renuevo el plan esta semana?',
      en: "Hey {name}! How are you? We haven't seen you in a while{classRef}. I can hold your usual spot — want to renew your plan this week?",
    },
    {
      es: 'Hola {name}, te extrañamos{classRef}. Si quieres retomar, te dejo todo listo. ¿Hablamos de la renovación?',
      en: "Hey {name}, we miss you{classRef}. If you want to pick back up, I'll get everything ready. Want to talk about renewing?",
    },
    {
      es: 'Hola {name}, ¿cómo estás? Hace rato no coincidimos{classRef}. ¿Qué te parece si renovamos tu plan y arrancamos de nuevo?',
      en: "Hey {name}, how are you? It's been a while since we caught up{classRef}. How about we renew your plan and get going again?",
    },
  ],
  plan_expiring: [
    {
      es: 'Hola {name}, tu plan vence el {expiryDay}. Para que no pierdas el ritmo, ¿te lo dejo renovado de una vez?',
      en: "Hey {name}, your plan expires on {expiryDay}. So you don't lose momentum, want me to renew it now?",
    },
    {
      es: 'Hola {name}, se viene el vencimiento de tu plan el {expiryDay}. ¿Lo renovamos para que sigas sin parar?',
      en: 'Hey {name}, your plan is up on {expiryDay}. Shall we renew so you keep going without a break?',
    },
    {
      es: 'Hola {name}, tu plan se vence el {expiryDay}. No quiero que pierdas tu cupo, ¿te lo renuevo?',
      en: "Hey {name}, your plan expires {expiryDay}. I don't want you to lose your spot — want me to renew it?",
    },
  ],
  came_back_expired: [
    {
      es: '¡{name}, qué bueno tenerte de vuelta! Para que no se corte la racha, ¿te renuevo el plan esta semana?',
      en: "{name}, great to have you back! So you don't lose the streak, want me to renew your plan this week?",
    },
    {
      es: '¡Hola {name}, qué alegría verte otra vez! Tu plan necesita renovación, ¿hablamos para dejarlo listo?',
      en: 'Hey {name}, so happy to see you again! Your plan needs a renewal — want to sort it out?',
    },
    {
      es: '¡{name}, qué bueno que volviste! ¿Te renuevo el plan para que sigas viniendo sin problema?',
      en: '{name}, welcome back! Want me to renew your plan so you can keep coming?',
    },
  ],
  came_back_active: [
    {
      es: '¡Qué bueno verte otra vez, {name}! ¿Cómo te sentiste? ¿Te vemos{nextClassRef}?',
      en: 'Great to see you again, {name}! How did it feel? See you{nextClassRef}?',
    },
    {
      es: '¡Hola {name}, me alegra que hayas vuelto! ¿Cómo te fue? ¿Te vemos{nextClassRef}?',
      en: 'Hey {name}, glad you came back! How was it? See you{nextClassRef}?',
    },
    {
      es: '¡{name}, genial que volviste! ¿Qué tal la clase? ¿Te animas a venir{nextClassRef}?',
      en: "{name}, awesome you're back! How was the class? Coming back{nextClassRef}?",
    },
  ],
  absent: [
    {
      es: 'Hola {name}, ¿todo bien? Hace rato no te vemos{coachRef}. ¿Te guardo cupo para{nextClassRef}?',
      en: "Hey {name}, everything okay? We haven't seen you in a while{coachRef}. Want me to save you a spot{nextClassRef}?",
    },
    {
      es: 'Hola {name}, te hemos extrañado{coachRef}. ¿Cómo estás? ¿Qué día te queda bien para volver?',
      en: "Hey {name}, we've missed you{coachRef}. How are you? What day works for you to come back?",
    },
    {
      es: 'Hola {name}, ¿cómo vas? Hace rato no coincidimos{coachRef}. ¿Te animas esta semana?',
      en: "Hey {name}, how's it going? It's been a while{coachRef}. Want to come in this week?",
    },
  ],
  visiting_less: [
    {
      es: 'Hola {name}, últimamente te hemos visto menos. ¿Cómo va todo? Si el horario se te complicó, ¿me cuentas y buscamos uno que te sirva?',
      en: "Hey {name}, we've seen you less lately. How's everything? If the schedule got tricky, want me to help find one that works?",
    },
    {
      es: 'Hola {name}, noté que has venido menos. ¿Todo bien? Si necesitas cambiar de horario, ¿hablamos?',
      en: "Hey {name}, I noticed you've been coming less. Everything okay? Need a schedule change?",
    },
    {
      es: 'Hola {name}, ¿cómo estás? Te hemos visto menos últimamente. ¿Hay algo que pueda hacer para que sea más fácil venir?',
      en: "Hey {name}, how are you? We've seen you less lately. Is there anything I can do to make it easier to come?",
    },
  ],
  new_not_coming: [
    {
      es: 'Hola {name}, ¿cómo te has sentido en tus primeras semanas? Es normal que cueste arrancar. ¿Qué día te queda mejor esta semana?',
      en: "Hey {name}, how have your first weeks been? It's totally normal to take time to settle in. What day works best for you this week?",
    },
    {
      es: 'Hola {name}, quería saber cómo te va. Si tienes dudas sobre clases u horarios, pregúntame. ¿Cuándo te animas a venir?',
      en: 'Hey {name}, wanted to check how things are going. Any questions about classes or schedules, just ask. When are you coming in?',
    },
    {
      es: 'Hola {name}, ¿cómo vas? Acá te esperamos. Si necesitas ayuda para armar tu rutina, cuéntame. ¿Qué día te sirve?',
      en: "Hey {name}, how are you? We're here for you. Need help building a routine? What day works?",
    },
  ],
  generic: [
    {
      es: 'Hola {name}, pasaba a saludarte. ¿Cómo va todo con el entrenamiento?',
      en: "Hey {name}, just checking in. How's everything going with your training?",
    },
    {
      es: 'Hola {name}, ¿cómo estás? ¿Hay algo que necesites para sentirte mejor en tus clases?',
      en: 'Hey {name}, how are you? Is there anything you need to feel better about your classes?',
    },
    {
      es: 'Hola {name}, quería saber cómo vas. ¿Todo bien por allá?',
      en: "Hey {name}, wanted to see how you're doing. Everything good on your end?",
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function compoundFirstName(fullName: string | null): string {
  if (!fullName) return '';
  const norm = fullName.trim();
  for (const compound of COMPOUND_FIRST_NAMES) {
    if (norm.startsWith(compound + ' ') || norm === compound) {
      return compound;
    }
  }
  return norm.split(' ')[0];
}

const BOGOTA = 'America/Bogota';

const ES_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayName(dateStr: string, lang: 'es' | 'en'): string {
  const d = new Date(dateStr);
  const bogotaDate = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  const dow = bogotaDate.getDay();
  return lang === 'es' ? ES_WEEKDAYS[dow] : EN_WEEKDAYS[dow];
}

function nextVisitDay(lastActivityAt: string | null, lang: 'es' | 'en'): string | null {
  if (!lastActivityAt) return null;
  const lastDow = new Date(new Date(lastActivityAt).toLocaleString('en-US', { timeZone: BOGOTA })).getDay();
  return lang === 'es' ? ES_WEEKDAYS[lastDow] : EN_WEEKDAYS[lastDow];
}

function bogotaHour(isoTime: string): number {
  const bogota = new Date(new Date(isoTime).toLocaleString('en-US', { timeZone: BOGOTA }));
  return bogota.getHours();
}

function formatClassHour(hour: number, lang: 'es' | 'en'): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (lang === 'en') {
    return `the ${h12} ${hour < 12 ? 'AM' : 'PM'} class`;
  }
  return h12 === 1 ? `la de la ${h12}` : `la de las ${h12}`;
}

// ── Coach name processing ──────────────────────────────────────

function stripCoachPrefix(name: string): string {
  return name.replace(/^(?:Coach|Profe)\s+/i, '');
}

function normalizeForComparison(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(?:coach|profe)\s+/i, '')
    .trim();
}

function isCoachSelf(coachName: string | null | undefined, loggedIn: string | null | undefined): boolean {
  if (!coachName || !loggedIn) return false;
  const a = normalizeForComparison(coachName).split(' ')[0];
  const b = normalizeForComparison(loggedIn).split(' ')[0];
  return a === b;
}

// ── Template variable builders ──────────────────────────────────

function buildClassRef(
  classStartTime: string | null | undefined,
  className: string | null | undefined,
  lang: 'es' | 'en'
): string {
  if (classStartTime) {
    const hour = bogotaHour(classStartTime);
    const ref = formatClassHour(hour, lang);
    return lang === 'es' ? ` en ${ref}` : ` at ${ref}`;
  }
  if (className) {
    return lang === 'es' ? ` en ${className}` : ` at ${className}`;
  }
  return '';
}

function buildNextClassRef(
  lastActivityAt: string | null,
  classStartTime: string | null | undefined,
  className: string | null | undefined,
  lang: 'es' | 'en'
): string {
  const day = nextVisitDay(lastActivityAt, lang);
  if (day && classStartTime) {
    const hour = bogotaHour(classStartTime);
    const ref = formatClassHour(hour, lang);
    return lang === 'es' ? ` el ${day} en ${ref}` : ` on ${day} at ${ref}`;
  }
  if (day && className) {
    return lang === 'es' ? ` el ${day} en ${className}` : ` on ${day} at ${className}`;
  }
  if (day) {
    return lang === 'es' ? ` el ${day}` : ` on ${day}`;
  }
  return lang === 'es' ? ' pronto' : ' soon';
}

function buildCoachRef(
  coachName: string | null | undefined,
  loggedInCoachName: string | null | undefined,
  lang: 'es' | 'en'
): string {
  if (!coachName) return '';
  if (isCoachSelf(coachName, loggedInCoachName)) {
    return lang === 'es' ? ' y me preguntaba cómo estabas' : ' and I was wondering how you were doing';
  }
  const clean = stripCoachPrefix(coachName);
  return lang === 'es' ? ` y ${clean} preguntó por ti` : ` and ${clean} asked about you`;
}

function buildExpiryDay(planEndsOn: string | null | undefined, lang: 'es' | 'en'): string {
  if (!planEndsOn) return lang === 'es' ? 'pronto' : 'soon';
  return weekdayName(planEndsOn, lang);
}

// ── Public API ──────────────────────────────────────────────────

export function selectCase(ctx: DraftContext): DraftCase {
  const r = ctx.reasons;

  const hasExpired = r.some((x) => x.includes('plan venció') || x.includes('Plan expired'));

  const hasExpiring = r.some((x) => (x.includes('plan vence') || x.includes('Plan expires')) && !x.includes('venció'));

  if (ctx.cameBack) {
    if (hasExpired) return 'came_back_expired';
    return 'came_back_active';
  }

  if (hasExpired) return 'plan_expired';
  if (hasExpiring) return 'plan_expiring';

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
    name: compoundFirstName(ctx.memberName),
    classRef: buildClassRef(ctx.classStartTime, ctx.className, ctx.language),
    nextClassRef: buildNextClassRef(ctx.lastActivityAt, ctx.classStartTime, ctx.className, ctx.language),
    coachRef: buildCoachRef(ctx.coachName, ctx.loggedInCoachName, ctx.language),
    expiryDay: buildExpiryDay(ctx.planEndsOn, ctx.language),
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
