// Bogotá wall-clock <-> UTC conversion for <input type="datetime-local">.
//
// Why this exists: a datetime-local value ('2026-10-12T21:00') carries no
// offset, and `new Date(value)` reads it in the DEVICE's time zone. A host
// creating a Medellín event from a phone still on Madrid or Miami time would
// save it hours off. Tribe's events happen in Colombia, so the value the host
// types is always Bogotá wall-clock time, whatever the device says.
//
// America/Bogota is UTC-5 all year (Colombia has no daylight saving), so the
// conversion is fixed arithmetic. Everything here reads and writes UTC fields
// only, which makes the result independent of the device zone by construction.
//
// For calendar-date helpers ("what day is it in Bogotá") see lib/time/bogotaDate.ts.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A datetime-local value, read as Bogotá time, to a UTC ISO string for a
 * timestamptz column. '2026-10-12T21:00' -> '2026-10-13T02:00:00.000Z'.
 *
 * Returns null for anything that is not a real calendar date and time
 * (empty, date-only, already carrying an offset, or e.g. 30 February), so the
 * caller has to handle it rather than saving an Invalid Date.
 */
export function bogotaLocalToUtc(localValue: string): string | null {
  const match = LOCAL_VALUE.exec(localValue);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  // Date.UTC silently rolls 30 Feb into March; reject anything that rolled.
  const check = new Date(wallClock);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return new Date(wallClock + BOGOTA_OFFSET_MS).toISOString();
}

/**
 * A stored timestamptz to the 'YYYY-MM-DDTHH:mm' Bogotá value a datetime-local
 * input expects, so pre-filling a form shows the time the host originally
 * typed. '2026-10-13T02:00:00Z' -> '2026-10-12T21:00'.
 *
 * Returns null for an empty or unparseable value.
 */
export function utcToBogotaLocal(iso: string): string | null {
  if (!iso) return null;
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return null;
  // Shifting the instant by the offset and reading the UTC fields gives the
  // Bogotá wall clock. The ISO string is 'YYYY-MM-DDTHH:mm:ss.sssZ'; keep 16.
  return new Date(instant - BOGOTA_OFFSET_MS).toISOString().slice(0, 16);
}
