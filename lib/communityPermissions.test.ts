import { describe, it, expect } from 'vitest';
import { getCommunityPermissions, type CommunityRole } from './communityPermissions';

const CREATOR = 'creator-uuid';
const OTHER = 'other-uuid';

function perms(userId: string | null, myRole: CommunityRole | null, creatorId: string | null = CREATOR) {
  return getCommunityPermissions({ userId, creatorId, myRole });
}

/**
 * Each row is one production policy, asked of each kind of viewer. The table
 * is the whole contract: if a policy changes, the row changes with it, and a
 * flag that drifts wider than its policy fails here by name.
 */
describe('community permissions mirror the production policies', () => {
  it('the creator can do everything, including delete', () => {
    expect(perms(CREATOR, 'admin')).toEqual({
      isOwner: true,
      canManage: true,
      canModeratePosts: true,
      canPin: true,
      canDelete: true,
    });
  });

  it('the creator keeps every right even without a membership row', () => {
    const p = perms(CREATOR, null);
    expect(p.canManage && p.canPin && p.canDelete && p.canModeratePosts).toBe(true);
  });

  it('an admin member can edit and moderate, but cannot pin or delete the community', () => {
    expect(perms(OTHER, 'admin')).toEqual({
      isOwner: false,
      canManage: true,
      canModeratePosts: true,
      canPin: false,
      canDelete: false,
    });
  });

  // The defect this module exists for: the banner button was shown to
  // moderators, and the communities UPDATE policy refused their write.
  it('a moderator can remove posts but cannot edit the community or change its banner', () => {
    expect(perms(OTHER, 'moderator')).toEqual({
      isOwner: false,
      canManage: false,
      canModeratePosts: true,
      canPin: false,
      canDelete: false,
    });
  });

  it('a plain member can do none of it', () => {
    const p = perms(OTHER, 'member');
    expect(Object.values(p).every((v) => v === false)).toBe(true);
  });

  it('a signed-out viewer can do none of it, even if the creator id is unknown', () => {
    expect(Object.values(perms(null, null)).every((v) => v === false)).toBe(true);
    expect(Object.values(perms(null, null, null)).every((v) => v === false)).toBe(true);
  });

  // A null creator must never match a null viewer and grant ownership.
  it('null does not equal null', () => {
    expect(perms(null, 'admin', null).isOwner).toBe(false);
  });
});
