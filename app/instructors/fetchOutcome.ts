/**
 * Turning two settled promises into "what do we have, and what failed" is the
 * fiddly part of the /instructors server fetch, and it is where a silent bug
 * would live: a rejected promise read as a success hands the page an empty list
 * and no failure flag, which is exactly the state this whole change exists to
 * make impossible.
 *
 * Three ways one fetch can fail, and all three must set the flag:
 *   - the promise rejected                      (createClient threw, network died)
 *   - it resolved with `success: false`         (the DAL caught a Supabase error)
 *   - it resolved successfully with no `data`   (shouldn't happen; not evidence
 *                                                of an empty directory either)
 *
 * Pure and dependency-free so the page stays thin and this is unit testable.
 * Extracted rather than inlined because a Server Component is awkward to test
 * and this logic is worth testing.
 */

/** The shape every DAL function in this codebase returns. */
export interface SettledFetch<T> {
  success: boolean;
  data?: T | null;
  error?: string;
}

export interface FetchOutcome<T> {
  /** Empty on failure. Never null, so callers cannot forget to check. */
  data: T[];
  failed: boolean;
  /** What to hand logError. Null when nothing failed. */
  cause: unknown;
}

export function resolveFetchOutcome<T>(
  settled: PromiseSettledResult<SettledFetch<T[]>>,
  label: string
): FetchOutcome<T> {
  if (settled.status === 'rejected') {
    return { data: [], failed: true, cause: settled.reason };
  }
  const { success, data, error } = settled.value;
  if (success && data) {
    return { data, failed: false, cause: null };
  }
  return {
    data: [],
    failed: true,
    cause: new Error(error ?? `${label} failed`),
  };
}
