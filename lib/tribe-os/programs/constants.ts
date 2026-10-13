export const PROGRAM_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_NAME_MAX = 120;
export const PROGRAM_DESCRIPTION_MAX = 2000;
export const PROGRAM_SPORT_MAX = 60;
export const TARGET_SESSIONS_MIN = 1;
export const TARGET_SESSIONS_MAX = 14;

export const PROGRAM_COLUMNS =
  'id, gym_id, name, description, sport, status, starts_at, ends_at, target_sessions_per_week, created_by, created_at, updated_at';
