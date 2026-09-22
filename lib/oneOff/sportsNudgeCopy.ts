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

/**
 * BILINGUAL, SPANISH FIRST, REGARDLESS OF preferred_language.
 *
 * The nudge used to pick one language from users.preferred_language. Measured
 * 2026-09-22: all 34 recipients read 'en', and so do 94 of 99 live users --
 * because the column is `VARCHAR(2) DEFAULT 'en'` and is only ever WRITTEN
 * when somebody touches the language toggle. A stored 'en' is therefore
 * indistinguishable from nobody having been asked.
 *
 * The app contradicts the column on exactly this point. LanguageContext's
 * no-signal fallback is SPANISH, in its own words because "Tribe is a
 * Medellín-first product". So a user who has never touched the toggle sees a
 * Spanish UI and would have received an English email.
 *
 * Sending both removes the guess. Spanish leads because that is the app's own
 * default for the no-signal case, which is most of this audience.
 */
export const bilingual = () => ({
  /** Push titles are truncated aggressively; a middot reads as one line. */
  pushTitle: `${SPORTS_NUDGE_ES.pushTitle} · ${SPORTS_NUDGE_EN.pushTitle}`,
  pushBody: `${SPORTS_NUDGE_ES.pushBody}\n${SPORTS_NUDGE_EN.pushBody}`,
  emailSubject: `${SPORTS_NUDGE_ES.emailSubject} · ${SPORTS_NUDGE_EN.emailSubject}`,
  es: SPORTS_NUDGE_ES,
  en: SPORTS_NUDGE_EN,
});

export type BilingualCopy = ReturnType<typeof bilingual>;
