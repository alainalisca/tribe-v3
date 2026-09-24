/**
 * What a signed-in user may do in one community, derived ONLY from what the
 * database will actually let them do.
 *
 * Each flag mirrors a production policy or grant, read from pg_policies on
 * 2026-09-23 and locked by migration 190. The client used to show the banner
 * button to moderators while RLS refused their write, and to show "Pin" to
 * admins and moderators while the posts UPDATE policy only admits the creator.
 * A button the database will refuse is a bug report waiting to happen, so the
 * rule here is: the client may be NARROWER than the database, never wider.
 * When a flag and its policy disagree, change the flag, not the policy. The
 * policy is what actually enforces.
 */

export type CommunityRole = 'admin' | 'moderator' | 'member';

export interface CommunityPermissionInput {
  userId: string | null;
  creatorId: string | null;
  /** The viewer's own row in community_members, if any. */
  myRole: CommunityRole | null;
}

export interface CommunityPermissions {
  /** Viewer created the community. */
  isOwner: boolean;
  /**
   * Edit details and change the banner.
   * Mirrors communities UPDATE "Admins can update their communities":
   * creator, or a member with role = 'admin'. Moderators are NOT included.
   */
  canManage: boolean;
  /**
   * Delete other people's posts.
   * Mirrors community_posts DELETE "Authors and admins can delete posts"
   * (role admin or moderator) OR "Authors or community admins can delete
   * posts" (creator). A post's own author can always delete it; that check
   * stays at the call site because it depends on the post.
   */
  canModeratePosts: boolean;
  /**
   * Pin and unpin posts.
   * Mirrors community_posts UPDATE "Community admins can update posts", whose
   * USING clause admits the creator only, despite its name.
   */
  canPin: boolean;
  /**
   * Soft delete the community.
   * Mirrors soft_delete_community() (migration 190): creator only. An admin
   * is someone the creator promoted; destroying the creator's community is a
   * different grant from moderating it.
   */
  canDelete: boolean;
}

export function getCommunityPermissions({ userId, creatorId, myRole }: CommunityPermissionInput): CommunityPermissions {
  const isOwner = !!userId && !!creatorId && userId === creatorId;
  const isAdminMember = !!userId && myRole === 'admin';
  const isModerator = !!userId && myRole === 'moderator';

  return {
    isOwner,
    canManage: isOwner || isAdminMember,
    canModeratePosts: isOwner || isAdminMember || isModerator,
    canPin: isOwner,
    canDelete: isOwner,
  };
}
