import { SPORTS_LIST, type Sport } from '@/lib/sports';
import type { PhotoKey } from './photos';

/**
 * T-SITE1 Part E. The Deportes page's groups, as the mock arranges the app's
 * sports. The list itself is lib/sports.ts (SPORTS_LIST); this only says which
 * group each sport sits in. Record<Sport, ...> makes a sport added to the app
 * without a group a type error; "Other" closes the last group as "Tu deporte".
 */
export type SportGroupKey = 'strength' | 'combat' | 'endurance' | 'mind' | 'team' | 'street';

const GROUP_OF: Record<Sport, SportGroupKey> = {
  HYROX: 'strength',
  CrossFit: 'strength',
  Weightlifting: 'strength',
  Calisthenics: 'strength',
  Boxing: 'combat',
  'Muay Thai': 'combat',
  Kickboxing: 'combat',
  'Jiu-Jitsu': 'combat',
  Running: 'endurance',
  Cycling: 'endurance',
  Swimming: 'endurance',
  Hiking: 'endurance',
  Yoga: 'mind',
  Pilates: 'mind',
  Dance: 'mind',
  Soccer: 'team',
  Basketball: 'team',
  Volleyball: 'team',
  Tennis: 'team',
  Padel: 'team',
  Skateboarding: 'street',
  BMX: 'street',
  Other: 'street',
};

const GROUP_IMG: Partial<Record<SportGroupKey, PhotoKey>> = {
  strength: 'sp_fuerza',
  combat: 'sp_combate',
  endurance: 'sp_resist',
  mind: 'sp_mente',
};

export type SportGroup = { key: SportGroupKey; sports: Sport[]; img?: PhotoKey };

const ORDER: SportGroupKey[] = ['strength', 'combat', 'endurance', 'mind', 'team', 'street'];

export const SPORT_GROUPS: SportGroup[] = ORDER.map((key) => ({
  key,
  sports: SPORTS_LIST.filter((s) => GROUP_OF[s] === key),
  img: GROUP_IMG[key],
}));
