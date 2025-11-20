export const SPORTS_LIST = [
  'Running',
  'Hiking', 
  'Cycling',
  'Swimming',
  'CrossFit',
  'Weightlifting',
  'Calisthenics',
  'Boxing',
  'Muay Thai',
  'Kickboxing',
  'Jiu-Jitsu',
  'Soccer',
  'Basketball',
  'Volleyball',
  'Yoga',
  'Pilates',
  'Dance',
  'Tennis',
  'Padel',
  'Skateboarding',
  'BMX',
  'Other',
] as const;

export type Sport = typeof SPORTS_LIST[number];

export const SPORTS_TRANSLATIONS: Record<Sport, { en: string; es: string }> = {
  'Running': { en: 'Running', es: 'Correr' },
  'Hiking': { en: 'Hiking', es: 'Senderismo' },
  'Cycling': { en: 'Cycling', es: 'Ciclismo' },
  'Swimming': { en: 'Swimming', es: 'Natación' },
  'CrossFit': { en: 'CrossFit', es: 'CrossFit' },
  'Weightlifting': { en: 'Weightlifting', es: 'Levantamiento de Pesas' },
  'Calisthenics': { en: 'Calisthenics', es: 'Calistenia' },
  'Boxing': { en: 'Boxing', es: 'Boxeo' },
  'Muay Thai': { en: 'Muay Thai', es: 'Muay Thai' },
  'Kickboxing': { en: 'Kickboxing', es: 'Kickboxing' },
  'Jiu-Jitsu': { en: 'Jiu-Jitsu', es: 'Jiu-Jitsu' },
  'Soccer': { en: 'Soccer', es: 'Fútbol' },
  'Basketball': { en: 'Basketball', es: 'Baloncesto' },
  'Volleyball': { en: 'Volleyball', es: 'Voleibol' },
  'Yoga': { en: 'Yoga', es: 'Yoga' },
  'Pilates': { en: 'Pilates', es: 'Pilates' },
  'Dance': { en: 'Dance', es: 'Baile' },
  'Tennis': { en: 'Tennis', es: 'Tenis' },
  'Padel': { en: 'Padel', es: 'Pádel' },
  'Skateboarding': { en: 'Skateboarding', es: 'Patinaje' },
  'BMX': { en: 'BMX', es: 'BMX' },
  'Other': { en: 'Other', es: 'Otro' },
};

export function getSportTranslation(sport: Sport, language: 'en' | 'es'): string {
  return SPORTS_TRANSLATIONS[sport][language];
}
