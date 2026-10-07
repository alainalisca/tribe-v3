/**
 * T-AV23: attribution resolution, shared by the pass page and /api/pase.
 *
 * Failure paths assert RECOGNITION (logError called, with the action), not
 * only the tidy aftermath: "no attribution" is also what no error handling at
 * all would produce (CLAUDE.md, outcome versus recognition).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal/athleteReferral', () => ({
  fetchAthleteProgramStatus: vi.fn(),
  findActiveAthleteByRefCode: vi.fn(),
}));

import { logError } from '@/lib/logger';
import { fetchAthleteProgramStatus, findActiveAthleteByRefCode } from '@/lib/dal/athleteReferral';
import { readAthleteValueConfig } from '@/lib/features/athleteValue';
import { resolveAthleteAttribution, consentForAttribution, consentForPassPage } from './athleteAttribution';

const DB = {} as SupabaseClient; // never touched directly: the DAL is mocked
const ON = readAthleteValueConfig({ ATHLETE_VALUE_ENABLED: 'all' });
const OFF_CFG = readAthleteValueConfig({});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(fetchAthleteProgramStatus).mockResolvedValue({ isActive: true });
  vi.mocked(findActiveAthleteByRefCode).mockResolvedValue({ programAthleteId: 'pa-ana', firstName: 'Ana' });
});

describe('resolveAthleteAttribution', () => {
  it('flag off: returns before any read', async () => {
    expect(await resolveAthleteAttribution(DB, 'p', 'atleta', 'ANA-7KQ', OFF_CFG)).toEqual({
      on: false,
      programAthleteId: null,
      firstName: null,
    });
    expect(fetchAthleteProgramStatus).not.toHaveBeenCalled();
    expect(findActiveAthleteByRefCode).not.toHaveBeenCalled();
  });

  it('flag on, program active, athlete link resolves: attributed', async () => {
    expect(await resolveAthleteAttribution(DB, 'p', 'atleta', 'ANA-7KQ', ON)).toEqual({
      on: true,
      programAthleteId: 'pa-ana',
      firstName: 'Ana',
    });
    expect(findActiveAthleteByRefCode).toHaveBeenCalledWith(DB, 'p', 'ANA-7KQ');
  });

  it('program inactive: off, and the athlete is never looked up', async () => {
    vi.mocked(fetchAthleteProgramStatus).mockResolvedValue({ isActive: false });
    expect((await resolveAthleteAttribution(DB, 'p', 'atleta', 'ANA-7KQ', ON)).on).toBe(false);
    expect(findActiveAthleteByRefCode).not.toHaveBeenCalled();
  });

  it('on, but not an athlete link (other src, no code, or a code of the wrong shape): QR yes, attribution no', async () => {
    for (const [src, code] of [
      ['print', 'ANA-7KQ'],
      ['atleta', null],
      ['atleta', 'x'],
      ['atleta', 'ANA 7KQ'],
    ] as const) {
      expect(await resolveAthleteAttribution(DB, 'p', src, code, ON)).toEqual({
        on: true,
        programAthleteId: null,
        firstName: null,
      });
    }
    expect(findActiveAthleteByRefCode).not.toHaveBeenCalled();
  });

  it('the athlete lookup throws: logged, QR stays on, no attribution', async () => {
    vi.mocked(findActiveAthleteByRefCode).mockRejectedValue(new Error('program_athletes read failed'));
    expect(await resolveAthleteAttribution(DB, 'p-1', 'atleta', 'ANA-7KQ', ON)).toEqual({
      on: true,
      programAthleteId: null,
      firstName: null,
    });
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'program_athletes read failed' }), {
      action: 'resolveAthleteAttribution',
      partnerId: 'p-1',
    });
  });

  it('the program lookup throws: logged, and off entirely', async () => {
    vi.mocked(fetchAthleteProgramStatus).mockRejectedValue(new Error('athlete_programs read failed'));
    expect((await resolveAthleteAttribution(DB, 'p-1', 'atleta', 'ANA-7KQ', ON)).on).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe('consentForAttribution', () => {
  it('unattributed: V1, nothing referred, no chip', () => {
    const r = consentForAttribution('BullBox', { on: true, programAthleteId: null, firstName: null });
    expect(r).toEqual({
      consentText: expect.stringMatching(/clase gratis\.$/),
      referredByAthleteId: null,
      invitedByFirstName: null,
      overLimit: false,
    });
  });

  it('attributed: the longer consent, the athlete id and the chip name together', () => {
    const r = consentForAttribution('BullBox', { on: true, programAthleteId: 'pa-ana', firstName: 'Ana' });
    expect(r.referredByAthleteId).toBe('pa-ana');
    expect(r.invitedByFirstName).toBe('Ana');
    expect(r.consentText).toContain('quien me invitó.');
  });

  it('over the 500-character CHECK: saved WITHOUT attribution, flagged for the log', () => {
    const r = consentForAttribution('G'.repeat(200), { on: true, programAthleteId: 'pa-ana', firstName: 'Ana' });
    expect(r).toEqual({
      consentText: expect.not.stringContaining('quien me invitó'),
      referredByAthleteId: null,
      invitedByFirstName: null,
      overLimit: true,
    });
  });
});

describe('consentForPassPage', () => {
  it('flag off: never awaits the query string and never reads the database', async () => {
    const sp = { then: vi.fn() } as unknown as Promise<Record<string, string>>; // a thenable that records being awaited
    const r = await consentForPassPage(DB, 'p', 'BullBox', sp);
    expect(r.invitedByFirstName).toBeNull();
    expect((sp as unknown as { then: ReturnType<typeof vi.fn> }).then).not.toHaveBeenCalled();
    expect(fetchAthleteProgramStatus).not.toHaveBeenCalled();
  });

  it('flag on: reads ?src=atleta&code= and attributes', async () => {
    vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
    const r = await consentForPassPage(
      DB,
      'p',
      'BullBox',
      Promise.resolve({ src: 'atleta', code: ['ANA-7KQ', 'IGNORED'] })
    );
    expect(r.invitedByFirstName).toBe('Ana');
    expect(findActiveAthleteByRefCode).toHaveBeenCalledWith(DB, 'p', 'ANA-7KQ');
  });
});
