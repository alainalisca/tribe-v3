/**
 * T-SITE1 Part B. One row of the public "La semana" board. Every field here is
 * public: no street address (`place` is a partner gym or a neighbourhood), no
 * coordinates, no contact data, the creator as first name and last initial.
 */
export type WeekRow = {
  id: string;
  /** Sport key as stored (e.g. "Boxing"); translated for display. */
  sport: string;
  /** The session title, or null when the session has none. */
  title: string | null;
  /** YYYY-MM-DD, America/Bogota. */
  date: string;
  /** HH:MM, 24h. */
  startTime: string;
  /** Minutes. */
  duration: number;
  /** Partner gym name, else neighbourhood, else the city. Never `sessions.location`. */
  place: string;
  /** Null when free. */
  price: { cents: number; currency: string } | null;
  /** Present only when > 0. */
  spotsLeft: number | null;
  /** "Andrés V." */
  creatorName: string;
  creatorAvatarUrl: string | null;
};
