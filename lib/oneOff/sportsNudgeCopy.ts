/**
 * Copy for the one-off "choose your sports" nudge.
 *
 * SPANISH IS PROVISIONAL AND GOES TO ANA BEFORE ANYTHING SENDS. It is written
 * Colombian, tú form, short: one reason and one button. It lives in this file
 * rather than inline so Ana can be sent one file and her edit lands in one
 * place -- CLAUDE.md records a Spanish fix that shipped half-done because the
 * same string lived in a component and in es.json.
 */
export interface NudgeCopy {
  pushTitle: string;
  pushBody: string;
  emailSubject: string;
  emailHeading: string;
  emailBody: string;
  emailCta: string;
  emailSignoff: string;
  unsubscribe: string;
}

export const SPORTS_NUDGE_ES: NudgeCopy = {
  pushTitle: '¿Qué entrenas?',
  pushBody: 'Elige tus deportes para que otros atletas te encuentren.',
  emailSubject: '¿Qué entrenas?',
  emailHeading: 'Elige tus deportes',
  emailBody:
    'Cuando eliges tus deportes, los atletas que entrenan lo mismo que tú pueden encontrarte. Sin deportes en tu perfil no apareces en las búsquedas de compañeros de entrenamiento. Toma menos de un minuto.',
  emailCta: 'Elegir mis deportes',
  emailSignoff: 'Nos vemos entrenando,\nEl equipo de Tribe',
  unsubscribe: 'Si no quieres recibir más correos nuestros, cancela tu suscripción aquí.',
};

export const SPORTS_NUDGE_EN: NudgeCopy = {
  pushTitle: 'What do you train?',
  pushBody: 'Choose your sports so other athletes can find you.',
  emailSubject: 'What do you train?',
  emailHeading: 'Choose your sports',
  emailBody:
    'When you choose your sports, athletes who train the same thing can find you. Without sports on your profile you do not show up in training partner searches. It takes less than a minute.',
  emailCta: 'Choose my sports',
  emailSignoff: 'See you out there,\nThe Tribe team',
  unsubscribe: 'If you would rather not hear from us, unsubscribe here.',
};

export const copyFor = (language: string | null | undefined): NudgeCopy =>
  language === 'en' ? SPORTS_NUDGE_EN : SPORTS_NUDGE_ES;
