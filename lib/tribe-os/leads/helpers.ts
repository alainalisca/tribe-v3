import type { LeadStatus } from './constants';

export function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/[\s\-.() ]/g, '');
  if (!cleaned.startsWith('+') && /^3\d{9}$/.test(cleaned)) {
    cleaned = '+57' + cleaned;
  }
  if (cleaned.startsWith('+')) {
    cleaned = '+' + cleaned.slice(1).replace(/\+/g, '');
  }
  return cleaned;
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9]{7,20}$/.test(phone);
}

export function nextStatusOptions(current: LeadStatus): LeadStatus[] {
  switch (current) {
    case 'new':
      return ['contacted', 'trial_booked', 'lost'];
    case 'contacted':
      return ['trial_booked', 'lost'];
    case 'trial_booked':
      return ['trial_done', 'lost'];
    case 'trial_done':
      return ['joined', 'lost'];
    case 'joined':
    case 'lost':
      return [];
  }
}

export function computeFollowUp(
  status: LeadStatus,
  now: Date,
  trialAt: string | null,
): string | null {
  switch (status) {
    case 'new':
      return now.toISOString();
    case 'contacted': {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      return d.toISOString();
    }
    case 'trial_booked': {
      if (!trialAt) return null;
      const d = new Date(trialAt);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    case 'trial_done': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    case 'joined':
    case 'lost':
      return null;
  }
}
