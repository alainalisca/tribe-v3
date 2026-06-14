// Sport translations for Colombia/Medellin market
export const sportTranslations: { [key: string]: { en: string; es: string } } = {
  All: { en: 'All', es: 'Todos' },
  Running: { en: 'Running', es: 'Correr' },
  Hiking: { en: 'Hiking', es: 'Senderismo' },
  Cycling: { en: 'Cycling', es: 'Ciclismo' },
  Swimming: { en: 'Swimming', es: 'Natacion' },
  CrossFit: { en: 'CrossFit', es: 'CrossFit' },
  Weightlifting: { en: 'Weightlifting', es: 'Levantamiento de Pesas' },
  Calisthenics: { en: 'Calisthenics', es: 'Calistenia' },
  Boxing: { en: 'Boxing', es: 'Boxeo' },
  'Muay Thai': { en: 'Muay Thai', es: 'Muay Thai' },
  Kickboxing: { en: 'Kickboxing', es: 'Kickboxing' },
  'Jiu-Jitsu': { en: 'Jiu-Jitsu', es: 'Jiu-Jitsu' },
  Soccer: { en: 'Soccer', es: 'Futbol' },
  Basketball: { en: 'Basketball', es: 'Baloncesto' },
  Volleyball: { en: 'Volleyball', es: 'Voleibol' },
  Yoga: { en: 'Yoga', es: 'Yoga' },
  Pilates: { en: 'Pilates', es: 'Pilates' },
  Dance: { en: 'Dance', es: 'Baile' },
  Tennis: { en: 'Tennis', es: 'Tenis' },
  Padel: { en: 'Padel', es: 'Padel' },
  Skateboarding: { en: 'Skateboarding', es: 'Patinaje' },
  BMX: { en: 'BMX', es: 'BMX' },
  Other: { en: 'Other', es: 'Otro' },
};

/**
 * Translate a stored sport name to the user's language, falling back to the
 * raw value for sports not in the table. Use this everywhere a sport is shown
 * instead of rendering `session.sport` directly — otherwise Spanish users see
 * English sport names ("Running" instead of "Correr").
 */
export function translateSport(sport: string | null | undefined, language: 'en' | 'es'): string {
  if (!sport) return '';
  return sportTranslations[sport]?.[language] ?? sport;
}
