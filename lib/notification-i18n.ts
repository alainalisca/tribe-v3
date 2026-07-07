/**
 * Bilingual (EN/ES) notification template helper for BUG-222.
 *
 * All server-side notification copy lives here so templates stay DRY and
 * callers never scatter inline ternaries across route files.
 *
 * Usage:
 *   const { title, body } = notificationCopy('join', lang, { name: 'Ana', sport: 'Running' });
 *
 * Fall-back: when `lang` is anything other than 'es', English is used. This
 * matches the project convention (es is the primary market; anything else
 * gets EN).
 */

export type NotificationLang = 'en' | 'es';

/** Normalise an arbitrary string to a supported NotificationLang. */
export function toLang(raw: string | null | undefined): NotificationLang {
  return raw === 'es' ? 'es' : 'en';
}

type Vars = Record<string, string | number>;

interface Template {
  en: { title: string; body: string };
  es: { title: string; body: string };
}

type TemplateKey =
  | 'join'
  | 'join_request'
  | 'join_guest'
  | 'waitlist_offered'
  | 'waitlist_expired'
  | 'spotlight_selected'
  | 'smart_match'
  | 'leave'
  | 'request_approved'
  | 'request_declined';

const TEMPLATES: Record<TemplateKey, Template> = {
  join: {
    en: {
      title: '🎉 New Training Partner!',
      body: '{{name}} joined your {{sport}} session',
    },
    es: {
      title: '🎉 ¡Nuevo compañero de entrenamiento!',
      body: '{{name}} se unio a tu sesion de {{sport}}',
    },
  },
  join_request: {
    en: {
      title: '📩 New Join Request',
      body: '{{name}} wants to join your {{sport}} session',
    },
    es: {
      title: '📩 Nueva solicitud de unirse',
      body: '{{name}} quiere unirse a tu sesion de {{sport}}',
    },
  },
  join_guest: {
    en: {
      title: '🎉 New Training Partner!',
      body: '{{name}} (guest) joined your {{sport}} session',
    },
    es: {
      title: '🎉 ¡Nuevo compañero de entrenamiento!',
      body: '{{name}} (invitado) se unio a tu sesion de {{sport}}',
    },
  },
  waitlist_offered: {
    en: {
      title: '🎟️ Spot available!',
      body: 'A spot opened up on a session you were waitlisted for.',
    },
    es: {
      title: '🎟️ ¡Cupo disponible!',
      body: 'Se abrio un cupo en una sesion en la que estabas en lista de espera.',
    },
  },
  waitlist_expired: {
    en: {
      title: '⏰ Spot offer expired',
      body: 'The spot offer for a waitlisted session has expired.',
    },
    es: {
      title: '⏰ Oferta de cupo vencida',
      body: 'La oferta de cupo para una sesion en lista de espera ha vencido.',
    },
  },
  spotlight_selected: {
    en: {
      title: '⭐ Instructor of the Week!',
      body: "Congratulations! You've been selected as Instructor of the Week!",
    },
    es: {
      title: '⭐ ¡Instructor de la Semana!',
      body: '¡Felicitaciones! Fuiste seleccionado como Instructor de la Semana.',
    },
  },
  smart_match: {
    en: {
      title: '🤝 Training match found',
      body: '{{name}} also trains {{sport}} near you',
    },
    es: {
      title: '🤝 Coincidencia de entrenamiento',
      body: '{{name}} tambien entrena {{sport}} cerca de ti',
    },
  },
  // T-NOTIF1: recipient = host (someone left their session).
  leave: {
    en: {
      title: '👋 Someone left',
      body: '{{name}} left your {{sport}} session',
    },
    es: {
      title: '👋 Alguien salio',
      body: '{{name}} salio de tu sesion de {{sport}}',
    },
  },
  // T-NOTIF1: recipient = athlete (host approved their join request).
  request_approved: {
    en: {
      title: '✅ Request approved',
      body: 'Your request to join "{{session}}" was approved',
    },
    es: {
      title: '✅ Solicitud aprobada',
      body: 'Tu solicitud para unirte a "{{session}}" fue aprobada',
    },
  },
  // T-NOTIF1: recipient = athlete (host declined their join request).
  request_declined: {
    en: {
      title: '❌ Request declined',
      body: 'Your request to join "{{session}}" was declined',
    },
    es: {
      title: '❌ Solicitud rechazada',
      body: 'Tu solicitud para unirte a "{{session}}" fue rechazada',
    },
  },
};

function interpolate(template: string, vars: Vars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/**
 * Returns the localised {title, body} for a given notification type and language.
 *
 * @param key       - Template key (see TemplateKey union above)
 * @param lang      - Recipient language; falls back to 'en' for anything other than 'es'
 * @param vars      - Optional interpolation variables (e.g. { name, sport })
 */
export function notificationCopy(
  key: TemplateKey,
  lang: NotificationLang,
  vars: Vars = {}
): { title: string; body: string } {
  const tpl = TEMPLATES[key][lang];
  return {
    title: interpolate(tpl.title, vars),
    body: interpolate(tpl.body, vars),
  };
}
