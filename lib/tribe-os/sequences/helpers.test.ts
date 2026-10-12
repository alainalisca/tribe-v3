import { describe, it, expect } from 'vitest';
import { dueDate, isDue, isOverdue, overdueDays, nextStep, isSequenceFinished, stepChannelToTouchChannel, computeCurrentStep, bogotaStartOfDayUTC } from './helpers';

describe('dueDate', () => {
  it('day 0 is the same calendar day as started_at in Bogota', () => {
    expect(dueDate('2026-10-05T12:00:00Z', 0)).toBe('2026-10-05');
  });

  it('day 3 adds 3 calendar days', () => {
    expect(dueDate('2026-10-05T12:00:00Z', 3)).toBe('2026-10-08');
  });

  it('day 7 adds 7 calendar days', () => {
    expect(dueDate('2026-10-05T12:00:00Z', 7)).toBe('2026-10-12');
  });

  it('handles Bogota midnight: 11pm Bogota (4am UTC next day) stays same date', () => {
    expect(dueDate('2026-10-06T04:00:00Z', 0)).toBe('2026-10-05');
  });

  it('handles Bogota midnight: 12:30am Bogota (5:30am UTC) is next date', () => {
    expect(dueDate('2026-10-06T05:30:00Z', 0)).toBe('2026-10-06');
  });

  it('crosses month boundary', () => {
    expect(dueDate('2026-10-28T12:00:00Z', 7)).toBe('2026-11-04');
  });
});

describe('isDue / isOverdue', () => {
  const started = '2026-10-05T12:00:00Z';

  it('step day_offset=3 is due on Oct 8 Bogota', () => {
    const oct8 = new Date('2026-10-08T15:00:00Z');
    expect(isDue(started, 3, oct8)).toBe(true);
    expect(isOverdue(started, 3, oct8)).toBe(false);
  });

  it('step day_offset=3 is not due on Oct 7 Bogota', () => {
    const oct7 = new Date('2026-10-07T15:00:00Z');
    expect(isDue(started, 3, oct7)).toBe(false);
    expect(isOverdue(started, 3, oct7)).toBe(false);
  });

  it('step day_offset=3 is overdue on Oct 9 Bogota', () => {
    const oct9 = new Date('2026-10-09T15:00:00Z');
    expect(isDue(started, 3, oct9)).toBe(true);
    expect(isOverdue(started, 3, oct9)).toBe(true);
  });
});

describe('overdueDays', () => {
  it('returns 0 on the due date', () => {
    const oct8 = new Date('2026-10-08T15:00:00Z');
    expect(overdueDays('2026-10-05T12:00:00Z', 3, oct8)).toBe(0);
  });

  it('returns 2 when 2 days late', () => {
    const oct10 = new Date('2026-10-10T15:00:00Z');
    expect(overdueDays('2026-10-05T12:00:00Z', 3, oct10)).toBe(2);
  });
});

describe('nextStep', () => {
  const steps = [
    { position: 1, day_offset: 0 },
    { position: 2, day_offset: 3 },
    { position: 3, day_offset: 7 },
  ];

  it('after step 1, next is step 2', () => {
    expect(nextStep(steps, 1)?.position).toBe(2);
  });

  it('after step 2, next is step 3', () => {
    expect(nextStep(steps, 2)?.position).toBe(3);
  });

  it('after step 3 (last), returns null', () => {
    expect(nextStep(steps, 3)).toBeNull();
  });

  it('at step 0 (start), next is step 1', () => {
    expect(nextStep(steps, 0)?.position).toBe(1);
  });
});

describe('isSequenceFinished', () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];

  it('not finished at step 2', () => {
    expect(isSequenceFinished(steps, 2)).toBe(false);
  });

  it('finished at step 3', () => {
    expect(isSequenceFinished(steps, 3)).toBe(true);
  });
});

describe('stepChannelToTouchChannel', () => {
  it('maps step channels to touch channels (identical)', () => {
    expect(stepChannelToTouchChannel('whatsapp')).toBe('whatsapp');
    expect(stepChannelToTouchChannel('call')).toBe('call');
    expect(stepChannelToTouchChannel('in_person')).toBe('in_person');
    expect(stepChannelToTouchChannel('other')).toBe('other');
  });
});

describe('computeCurrentStep', () => {
  const steps = [{ position: 1 }, { position: 2 }, { position: 3 }];

  it('returns first step when nothing completed', () => {
    expect(computeCurrentStep(steps, [])).toEqual({ position: 1, finished: false });
  });

  it('advances to step 2 after step 1 completed', () => {
    expect(computeCurrentStep(steps, [1])).toEqual({ position: 2, finished: false });
  });

  it('advances to step 3 after steps 1 and 2 completed', () => {
    expect(computeCurrentStep(steps, [1, 2])).toEqual({ position: 3, finished: false });
  });

  it('marks finished when all steps completed', () => {
    expect(computeCurrentStep(steps, [1, 2, 3])).toEqual({ position: 3, finished: true });
  });

  it('handles non-contiguous completions (step 1 and 3 done, step 2 not done)', () => {
    expect(computeCurrentStep(steps, [1, 3])).toEqual({ position: 2, finished: false });
  });

  it('handles unsorted step positions', () => {
    const unsorted = [{ position: 3 }, { position: 1 }, { position: 2 }];
    expect(computeCurrentStep(unsorted, [1])).toEqual({ position: 2, finished: false });
  });

  it('handles single step sequence', () => {
    expect(computeCurrentStep([{ position: 1 }], [])).toEqual({ position: 1, finished: false });
    expect(computeCurrentStep([{ position: 1 }], [1])).toEqual({ position: 1, finished: true });
  });

  it('works with gaps in positions (1, 3, 5)', () => {
    const gapped = [{ position: 1 }, { position: 3 }, { position: 5 }];
    expect(computeCurrentStep(gapped, [1])).toEqual({ position: 3, finished: false });
    expect(computeCurrentStep(gapped, [1, 3])).toEqual({ position: 5, finished: false });
    expect(computeCurrentStep(gapped, [1, 3, 5])).toEqual({ position: 5, finished: true });
  });
});

describe('bogotaStartOfDayUTC', () => {
  it('returns 05:00 UTC for any Bogota date (COT = UTC-5)', () => {
    const noon = new Date('2026-10-12T17:00:00Z');
    expect(bogotaStartOfDayUTC(noon)).toBe('2026-10-12T05:00:00.000Z');
  });

  it('before 05:00 UTC is still previous Bogota day', () => {
    const earlyUTC = new Date('2026-10-12T04:30:00Z');
    expect(bogotaStartOfDayUTC(earlyUTC)).toBe('2026-10-11T05:00:00.000Z');
  });

  it('at exactly 05:00 UTC is next Bogota day', () => {
    const exactMidnight = new Date('2026-10-12T05:00:00Z');
    expect(bogotaStartOfDayUTC(exactMidnight)).toBe('2026-10-12T05:00:00.000Z');
  });
});
