/** T-MOM1: who may delete a photo: its uploader, the session's host, or an admin (a photographer only their own). */
export function canDeleteMoment(c: {
  userId: string | null;
  uploaderId: string;
  hostId: string | null;
  isAdmin: boolean;
}): boolean {
  if (!c.userId) return false;
  return c.userId === c.uploaderId || c.userId === c.hostId || c.isAdmin;
}
