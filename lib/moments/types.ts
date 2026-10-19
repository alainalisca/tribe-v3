/** T-MOM1: what the upload and tagging screen works with. */
export type TaggablePerson =
  | { kind: 'host'; id: string; name: string; avatarUrl: string | null }
  | { kind: 'user'; id: string; name: string; avatarUrl: string | null }
  | { kind: 'guest'; id: string; name: string; hasPhone: boolean }
  | { kind: 'invite'; id: string; name: string; hasPhone: boolean; claimed: boolean };

/** A person as the tagging API takes them: a user, an invite, or a session guest (becomes an invite). */
export type TagTarget = { kind: 'user'; id: string } | { kind: 'invite'; id: string } | { kind: 'guest'; id: string };

export type MomentTag = {
  id: string;
  kind: 'user' | 'invite';
  personId: string;
  name: string;
  delivered: boolean;
  removed: boolean;
};

export type MomentItem = {
  id: string;
  gridUrl: string | null;
  width: number | null;
  height: number | null;
  uploaderId: string;
  createdAt: string;
  tags: MomentTag[];
};

export type SessionMomentsState = {
  sessionId: string;
  media: MomentItem[];
  people: TaggablePerson[];
};

/** The key a tag target is known by on screen and in the picker. */
export function personKey(p: { kind: string; id: string }): string {
  return `${p.kind === 'host' ? 'user' : p.kind}:${p.id}`;
}

/** T-MOM1 Part C: one photo in a person's own Momentos. */
export type MyMoment = {
  mediaId: string;
  gridUrl: string | null;
  viewerUrl: string | null;
  width: number | null;
  height: number | null;
  thanked: boolean;
  /** "Mostrar en la página de <coach>" (Part D): this person's own choice for this photo. */
  onCoachPage: boolean;
};

/** One session's photos of this person, as their Momentos shows them. */
export type MyMomentsBatch = {
  sessionId: string;
  title: string | null;
  sport: string | null;
  date: string;
  coachName: string | null;
  photos: MyMoment[];
};
