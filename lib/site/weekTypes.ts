/**
 * T-SITE1 Part B. One row of the public "La semana" board: one series (or
 * one-off session) this week. Every field here is public: no street address
 * (`place` is a partner gym or a neighbourhood), no coordinates, no contact
 * data, the creator as first name and last initial.
 */
export type WeekRow = {
  /** The next occurrence: the row links to /session/{id}/. */
  id: string;
  /** The series root (seriesParentId); a one-off is its own. */
  seriesId: string;
  /** Sport key as stored (e.g. "Boxing"); translated for display. */
  sport: string;
  /** The session title, or null when it has none ("<Sport> con <First name>" is shown). */
  title: string | null;
  /** The next occurrence's date, YYYY-MM-DD, America/Bogota. */
  date: string;
  /** HH:MM, 24h, of the next occurrence. */
  startTime: string;
  /** ISO weekdays (1 = Monday) the series meets this week, sorted: "Lun a vie". */
  weekdays: number[];
  /** Minutes. */
  duration: number;
  /** Partner gym name, else neighbourhood; null when only the city is known. Never `sessions.location`. */
  place: string | null;
  /** Null when free. */
  price: { cents: number; currency: string } | null;
  /** Present only when > 0. */
  spotsLeft: number | null;
  /** For coach variety only; not rendered. */
  creatorId: string;
  /** "Andrés", for the fallback title. */
  creatorFirstName: string;
  /** "Andrés V." */
  creatorName: string;
  creatorAvatarUrl: string | null;
};
