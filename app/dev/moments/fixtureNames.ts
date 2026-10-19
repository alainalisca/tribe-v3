/**
 * /dev/moments' fixture photo names (dev/fixtures/moments/<name>.jpg). Pure,
 * so the client screens can name them; reading them is fixtures.ts, server only.
 */
export const FIXTURES = [
  'hero_full',
  'door_ath',
  'door_coach',
  'door_gym',
  'door_os',
  'essay_bb',
  'essay_zona',
  'essay_wil',
  'essay_yoga',
] as const;
export type Fixture = (typeof FIXTURES)[number];
export type FixturePhotos = Record<Fixture, string>;
