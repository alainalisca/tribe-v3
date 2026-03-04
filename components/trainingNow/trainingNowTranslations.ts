export interface TrainingNowTexts {
  title: string;
  whatTraining: string;
  where: string;
  useLocation: string;
  gettingLocation: string;
  locationPlaceholder: string;
  when: string;
  now: string;
  min30: string;
  hour1: string;
  howLong: string;
  min30dur: string;
  hour1dur: string;
  hour15dur: string;
  hour2dur: string;
  notify: string;
  creating: string;
}

export function getTrainingNowTexts(language: 'en' | 'es'): TrainingNowTexts {
  if (language === 'es') {
    return {
      title: 'Entrenar Ahora',
      whatTraining: '¿Qué vas a entrenar?',
      where: '¿Dónde?',
      useLocation: '📍 Usar mi ubicación',
      gettingLocation: 'Obteniendo ubicación...',
      locationPlaceholder: 'ej. Bodytech Poblado',
      when: '¿Cuándo empiezas?',
      now: 'Ahora',
      min30: '30 min',
      hour1: '1 hora',
      howLong: '¿Cuánto tiempo?',
      min30dur: '30 min',
      hour1dur: '1 hora',
      hour15dur: '1.5 hrs',
      hour2dur: '2 horas',
      notify: '🔔 NOTIFICAR COMPAÑEROS CERCANOS',
      creating: 'Creando...',
    };
  }
  return {
    title: 'Training Now',
    whatTraining: 'What are you training?',
    where: 'Where?',
    useLocation: '📍 Use my location',
    gettingLocation: 'Getting location...',
    locationPlaceholder: 'e.g. Central Park',
    when: 'When are you starting?',
    now: 'Now',
    min30: '30 min',
    hour1: '1 hour',
    howLong: 'How long?',
    min30dur: '30 min',
    hour1dur: '1 hour',
    hour15dur: '1.5 hrs',
    hour2dur: '2 hours',
    notify: '🔔 NOTIFY NEARBY PARTNERS',
    creating: 'Creating...',
  };
}
