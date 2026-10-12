export const ENROLLMENT_STATUSES = ['pending_approval', 'active', 'completed', 'stopped', 'came_back'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLED_BY_TYPES = ['user', 'system'] as const;
export type EnrolledByType = (typeof ENROLLED_BY_TYPES)[number];

export const STEP_CHANNELS = ['whatsapp', 'call', 'in_person', 'other'] as const;
export type StepChannel = (typeof STEP_CHANNELS)[number];

export const AUTONOMY_MODES = ['manual', 'suggest', 'auto'] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const STEP_POSITION_MIN = 1;
export const STEP_POSITION_MAX = 20;
export const DAY_OFFSET_MIN = 0;
export const DAY_OFFSET_MAX = 60;
export const SEQUENCE_NAME_MAX = 120;

export const SYSTEM_DAILY_ENROLL_CAP = 5;
export const PENDING_EXPIRY_DAYS = 7;
