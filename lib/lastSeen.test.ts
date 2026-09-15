import { describe, it, expect } from 'vitest';
import { lastSeenLabel } from './lastSeen';

const NOW = new Date('2026-09-14T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('lastSeenLabel', () => {
  it('reads "never" for an account that has never logged in', () => {
    expect(lastSeenLabel(null, 'en', NOW)).toBe('never');
    expect(lastSeenLabel(undefined, 'en', NOW)).toBe('never');
    expect(lastSeenLabel(null, 'es', NOW)).toBe('nunca');
  });

  it('does not render a null as an age since the epoch', () => {
    // The failure this guards: `new Date(null)` is 1970, which would print as
    // "20454d" and read like a real, very old login.
    expect(lastSeenLabel(null, 'en', NOW)).not.toMatch(/\d/);
  });

  it('reads "never" for an unparseable timestamp rather than NaN', () => {
    expect(lastSeenLabel('not-a-date', 'en', NOW)).toBe('never');
  });

  it('scales minutes -> hours -> days -> years', () => {
    expect(lastSeenLabel(ago(5 * 60_000), 'en', NOW)).toBe('5m');
    expect(lastSeenLabel(ago(3 * 3_600_000), 'en', NOW)).toBe('3h');
    expect(lastSeenLabel(ago(3 * 86_400_000), 'en', NOW)).toBe('3d');
    expect(lastSeenLabel(ago(800 * 86_400_000), 'en', NOW)).toBe('2y');
  });

  it('reports a future timestamp as now, not as a negative age', () => {
    expect(lastSeenLabel(new Date(NOW + 60_000).toISOString(), 'en', NOW)).toBe('now');
  });
});
