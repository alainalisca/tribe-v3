export function getTrainingNowTranslations(language: 'en' | 'es') {
  return language === 'es'
    ? {
        title: 'Entrenar Ahora',
        whatTraining: '\u00bfQu\u00e9 vas a entrenar?',
        where: '\u00bfD\u00f3nde?',
        useLocation: 'Usar mi ubicaci\u00f3n',
        whenStarting: '\u00bfCu\u00e1ndo empiezas?',
        now: 'Ahora',
        howLong: '\u00bfCu\u00e1nto tiempo?',
        notify: 'NOTIFICAR COMPA\u00d1EROS CERCANOS',
        creating: 'Creando...',
      }
    : {
        title: 'Training Now',
        whatTraining: 'What are you training?',
        where: 'Where?',
        useLocation: 'Use my location',
        whenStarting: 'When are you starting?',
        now: 'Now',
        howLong: 'How long?',
        notify: 'NOTIFY NEARBY PARTNERS',
        creating: 'Creating...',
      };
}

export type TrainingNowTranslations = ReturnType<typeof getTrainingNowTranslations>;
