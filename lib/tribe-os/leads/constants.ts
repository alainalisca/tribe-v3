export const LEAD_SOURCES = ['walk_in', 'instagram', 'whatsapp', 'referral', 'tribe_app', 'website', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ['new', 'contacted', 'trial_booked', 'trial_done', 'joined', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_ACTIVITY_KINDS = ['note', 'whatsapp', 'call', 'in_person', 'status_change'] as const;
export type LeadActivityKind = (typeof LEAD_ACTIVITY_KINDS)[number];

export const FULL_NAME_MAX = 120;
export const INTEREST_MAX = 120;
export const LOST_REASON_MIN = 1;
export const LOST_REASON_MAX = 200;
export const ACTIVITY_BODY_MAX = 1000;
export const EMAIL_MAX = 254;
export const PHONE_REGEX = /^\+?[0-9]{7,20}$/;
export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const LOST_REASON_PRESETS = ['Precio', 'Horario', 'Distancia', 'No respondió', 'Otro'] as const;
