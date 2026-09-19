/**
 * The sport vocabulary for `local_fitness_events.sport_type`.
 *
 * NOT Tribe's sport list, and deliberately not reconciled with it. `SPORTS_LIST`
 * in lib/sports.ts is Title Case and describes what a Tribe instructor teaches;
 * this is lowercase and describes a column on a different table, seeded by
 * migration 021 and written by the admin events form. Folding one into the
 * other would break every filter, because `.eq('sport_type', 'Jiu-Jitsu')`
 * matches nothing in a column whose values are `running` and `multi-sport`.
 *
 * WHY IT IS A MODULE RATHER THAN TWO LITERALS. It was two literals, and they
 * disagreed, in exactly the way Issue 1 disagreed:
 *
 *   app/admin/events/page.tsx      10 values, the WRITE side
 *   components/LocalFitnessEventsSection.tsx  6 values, the READ side
 *
 * So an admin could file an event under `multi-sport` or `calisthenics` and no
 * public chip could ever select it. Measured against migration 021's seed: 20
 * events, 8 distinct sport_type values, and 5 of those 20 rows reachable only
 * under "All". That is Ronald and Jiu-Jitsu again -- a value present in the
 * data with no chip that selects it -- in a second table.
 *
 * Both sides import this. Adding a sport means adding it here, once.
 */
export const LOCAL_EVENT_SPORTS = [
  'running',
  'cycling',
  'hiking',
  'yoga',
  'crossfit',
  'calisthenics',
  'swimming',
  'multi-sport',
  'skateboarding',
  'parkour',
] as const;

export type LocalEventSport = (typeof LOCAL_EVENT_SPORTS)[number];
