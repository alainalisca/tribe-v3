/**
 * The name a session is shown under.
 *
 * `sessions.title` is optional and, in practice, usually NULL -- every one of
 * BullBox's sessions has no title. SessionCard has always handled that with a
 * derived name ("CrossFit with Darian"); the two public share pages did not, so
 * /g/[slug] rendered an empty <p> where the name belongs and the row showed a
 * date, a time and a sport with nothing to identify it.
 *
 * Extracted here so there is ONE derivation rather than a third copy. The
 * translated joining word is passed in rather than read from a hook, so this
 * stays callable from anywhere -- including a server component.
 */

/**
 * First and last name only.
 *
 * The title carries the instructor's name, and "Boxeo con Salomon Tabares
 * Adarve" wraps to two lines on a phone while saying no more than "Boxeo con
 * Salomon Tabares".
 */
export function shortName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

export function sessionDisplayTitle({
  title,
  sportName,
  instructorName,
  withWord,
}: {
  title: string | null | undefined;
  /** Already translated, e.g. translateSport(session.sport, language). */
  sportName: string;
  instructorName: string | null | undefined;
  /** The translated joining word: 'with' / 'con'. */
  withWord: string;
}): string {
  const given = title?.trim();
  if (given) return given;

  const who = shortName(instructorName);
  // BEHAVIOUR CHANGE vs the inline version this replaces: with no instructor
  // name, `${sport} ${with} ${''}`.trim() produced a title ending in a dangling
  // "with" -- "CrossFit with". sessions_public exposes creator_name, so this is
  // reachable for any session whose creator row is missing or unnamed. The
  // sport alone is the honest fallback.
  return who ? `${sportName} ${withWord} ${who}` : sportName;
}
