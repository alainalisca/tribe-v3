import type { Sport } from '@/lib/sports';
import type { PhotoKey } from './photos';

/**
 * T-SITE1 Part E. The Deportes page's groups, as the mock arranges the app's
 * sports (lib/sports.ts). Every sport except "Other" is in exactly one group
 * (sportGroups.test.ts); "Other" closes the last group as "Tu deporte".
 */
export type SportGroup = { key: string; sports: Sport[]; img?: PhotoKey };

export const SPORT_GROUPS: SportGroup[] = [
  { key: 'strength', sports: ['HYROX', 'CrossFit', 'Weightlifting', 'Calisthenics'], img: 'sp_fuerza' },
  { key: 'combat', sports: ['Boxing', 'Muay Thai', 'Kickboxing', 'Jiu-Jitsu'], img: 'sp_combate' },
  { key: 'endurance', sports: ['Running', 'Cycling', 'Swimming', 'Hiking'], img: 'sp_resist' },
  { key: 'mind', sports: ['Yoga', 'Pilates', 'Dance'], img: 'sp_mente' },
  { key: 'team', sports: ['Soccer', 'Basketball', 'Volleyball', 'Tennis', 'Padel'] },
  { key: 'street', sports: ['Skateboarding', 'BMX', 'Other'] },
];
