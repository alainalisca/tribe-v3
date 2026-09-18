import { describe, it, expect } from 'vitest';
import { resolveFetchOutcome } from './fetchOutcome';

/**
 * The silent bug this prevents: reading a REJECTED promise as a success. That
 * hands the page an empty list with `failed: false`, which is the exact state
 * the four-state split exists to make impossible -- the viewer is told the
 * directory is empty while the database is down, and nothing is logged.
 *
 * Every arm asserts the flag AND the data, because "empty" and "failed" being
 * separable is the whole point.
 */
describe('resolveFetchOutcome', () => {
  it('a fulfilled, successful fetch passes its data through and does not flag', () => {
    const out = resolveFetchOutcome({ status: 'fulfilled', value: { success: true, data: [1, 2] } }, 'f');
    expect(out.data).toEqual([1, 2]);
    expect(out.failed).toBe(false);
    expect(out.cause).toBeNull();
  });

  it('a REJECTED promise flags, and surfaces the rejection reason for the log', () => {
    const boom = new Error('createClient threw');
    const out = resolveFetchOutcome({ status: 'rejected', reason: boom }, 'f');
    expect(out.failed).toBe(true);
    expect(out.data).toEqual([]);
    expect(out.cause).toBe(boom);
  });

  it('a DAL error result flags, and carries the DAL message', () => {
    const out = resolveFetchOutcome(
      { status: 'fulfilled', value: { success: false, error: 'permission denied' } },
      'f'
    );
    expect(out.failed).toBe(true);
    expect(out.data).toEqual([]);
    expect((out.cause as Error).message).toBe('permission denied');
  });

  it('names the fetch when the DAL gave no message, so the log is not anonymous', () => {
    const out = resolveFetchOutcome({ status: 'fulfilled', value: { success: false } }, 'fetchInstructors');
    expect((out.cause as Error).message).toBe('fetchInstructors failed');
  });

  it('success with null data flags rather than reporting an empty directory', () => {
    // Should not happen, but "succeeded with nothing" is not evidence that
    // there is nothing. Treating it as success is how a silent empty ships.
    const out = resolveFetchOutcome({ status: 'fulfilled', value: { success: true, data: null } }, 'f');
    expect(out.failed).toBe(true);
    expect(out.data).toEqual([]);
  });

  it('an empty but successful fetch is NOT a failure', () => {
    // The other direction matters just as much: a genuinely empty directory
    // must not be reported as an error, or the page cries wolf.
    const out = resolveFetchOutcome({ status: 'fulfilled', value: { success: true, data: [] } }, 'f');
    expect(out.failed).toBe(false);
    expect(out.data).toEqual([]);
    expect(out.cause).toBeNull();
  });

  it('resolves the two fetches independently, which Promise.all could not', () => {
    const ok = resolveFetchOutcome({ status: 'fulfilled', value: { success: true, data: ['i'] } }, 'instructors');
    const bad = resolveFetchOutcome({ status: 'rejected', reason: new Error('gyms down') }, 'gyms');
    expect(ok.failed).toBe(false);
    expect(ok.data).toEqual(['i']);
    expect(bad.failed).toBe(true);
  });
});
