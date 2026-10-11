const BOGOTA = 'America/Bogota';

function toBogotaDateStr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function todayBogota(now?: Date): string {
  return (now ?? new Date()).toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

export function dueDate(startedAt: string, dayOffset: number): string {
  const startDate = toBogotaDateStr(startedAt);
  return addCalendarDays(startDate, dayOffset);
}

export function isDue(startedAt: string, dayOffset: number, now?: Date): boolean {
  const due = dueDate(startedAt, dayOffset);
  const today = todayBogota(now);
  return today >= due;
}

export function isOverdue(startedAt: string, dayOffset: number, now?: Date): boolean {
  const due = dueDate(startedAt, dayOffset);
  const today = todayBogota(now);
  return today > due;
}

export function overdueDays(startedAt: string, dayOffset: number, now?: Date): number {
  const due = dueDate(startedAt, dayOffset);
  const today = todayBogota(now);
  const dueMs = new Date(due).getTime();
  const todayMs = new Date(today).getTime();
  return Math.max(0, Math.round((todayMs - dueMs) / 86_400_000));
}

export interface StepPosition {
  position: number;
}

export function nextStep<T extends StepPosition>(steps: T[], currentStep: number): T | null {
  const sorted = [...steps].sort((a, b) => a.position - b.position);
  return sorted.find((s) => s.position > currentStep) ?? null;
}

export function isSequenceFinished<T extends StepPosition>(steps: T[], currentStep: number): boolean {
  return nextStep(steps, currentStep) === null;
}

export type StepChannel = 'whatsapp' | 'call' | 'in_person' | 'other';
export type TouchChannel = 'whatsapp' | 'call' | 'in_person' | 'other';

export function stepChannelToTouchChannel(ch: StepChannel): TouchChannel {
  return ch;
}

export const STEP_CHANNEL_LABELS = {
  en: { whatsapp: 'WhatsApp', call: 'Call', in_person: 'In person', other: 'Other' },
  es: { whatsapp: 'WhatsApp', call: 'Llamada', in_person: 'En persona', other: 'Otro' },
} as const;

export const STOP_REASONS = {
  en: [
    { value: 'came_back', label: 'Came back' },
    { value: 'declined', label: 'Does not want to continue' },
    { value: 'other', label: 'Other' },
  ],
  es: [
    { value: 'came_back', label: 'Ya volvió' },
    { value: 'declined', label: 'No quiere seguir' },
    { value: 'other', label: 'Otro' },
  ],
} as const;
