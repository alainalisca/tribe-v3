import 'server-only';
import { logError } from '@/lib/logger';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { isVisibleUser } from '@/lib/dal/visibleUsers';
import { PUBLIC_REVIEWS_SHOWN, ratingToShow, reviewerDisplayName } from './publicProfile';

/**
 * T-POLISH1 PR 3b-1: what the public coach (/i) and gym (/g) pages bring over
 * from the storefront, read on the server with the service role.
 *
 * WHAT LEAVES THE SERVER IS ONLY WHAT THE PAGE PRINTS. A review becomes a
 * rating, a comment, a date and "María G." -- no review id, no reviewer id, no
 * full name, no avatar -- so neither the HTML nor the RSC payload carries an
 * identifier a scraper could join on. A reviewer who is a test or banned
 * account is left out. T-DEL1: a deleted account's review stays, stars and
 * text, under "Usuario eliminado" (Al's call): deletion keeps what a person
 * wrote about someone else and removes who they were.
 *
 * Every read fails soft: a page that cannot load its reviews shows none rather
 * than a 500 on a link printed in someone's bio.
 */

export type PublicReview = { rating: number; comment: string | null; createdAt: string; reviewer: string };

export type PublicReviews = {
  items: PublicReview[];
  /** Visible reviews in total, not just the ones listed. */
  count: number;
  /** The average to show, or null below MIN_REVIEWS_FOR_RATING. */
  rating: number | null;
};

export type PublicPass = { slug: string; partnerName: string };

export type CoachExtras = {
  tagline: string | null;
  certifications: string[];
  verified: boolean;
  videoUrl: string | null;
  videoPoster: string | null;
  reviews: PublicReviews;
  /** An independent coach's own free-class pass, when it is on. */
  pass: PublicPass | null;
};

export type GymRosterCoach = { id: string; name: string; avatarUrl: string | null };

export type GymExtras = {
  /** The gym account's user id: what Mensaje and Seguir act on (the same id /storefront/<id> uses). */
  ownerId: string | null;
  pass: PublicPass | null;
  roster: GymRosterCoach[];
};

const NO_REVIEWS: PublicReviews = { items: [], count: 0, rating: null };

type ReviewRow = {
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: {
    name: string | null;
    is_test_account: boolean | null;
    banned: boolean | null;
    deleted_at: string | null;
  } | null;
};

/**
 * A coach's reviews for a public page. `athlete` is the label for a reviewer
 * with no usable name, `deleted` the one for a deleted account.
 */
export async function fetchPublicReviews(
  hostId: string,
  athlete: string,
  deleted = 'Usuario eliminado'
): Promise<PublicReviews> {
  try {
    const { data, error } = await getServiceRoleClient()
      .from('reviews')
      .select('rating, comment, created_at, reviewer:reviewer_id(name, is_test_account, banned, deleted_at)')
      .eq('host_id', hostId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      logError(error, { action: 'site.fetchPublicReviews', hostId });
      return NO_REVIEWS;
    }
    const rows = ((data ?? []) as unknown as ReviewRow[]).filter(
      (r) => r.rating >= 1 && r.rating <= 5 && !!r.reviewer && !r.reviewer.is_test_account && !r.reviewer.banned
    );
    const sum = rows.reduce((acc, r) => acc + r.rating, 0);
    return {
      items: rows.slice(0, PUBLIC_REVIEWS_SHOWN).map((r) => ({
        rating: r.rating,
        comment: r.comment?.trim() || null,
        createdAt: r.created_at,
        reviewer: r.reviewer?.deleted_at ? deleted : reviewerDisplayName(r.reviewer?.name, athlete),
      })),
      count: rows.length,
      rating: rows.length ? ratingToShow(rows.length, sum / rows.length) : null,
    };
  } catch (error) {
    logError(error, { action: 'site.fetchPublicReviews', hostId });
    return NO_REVIEWS;
  }
}

type PartnerPassRow = { slug: string | null; business_name: string | null; pass_active: boolean | null };

function passOf(row: PartnerPassRow | null | undefined): PublicPass | null {
  if (!row || row.pass_active !== true || !row.slug) return null;
  return { slug: row.slug, partnerName: row.business_name ?? '' };
}

/** Everything /i shows beyond loadCoach's row. */
export async function fetchCoachExtras(coachId: string, athlete: string, deleted?: string): Promise<CoachExtras> {
  const admin = getServiceRoleClient();
  const [userRes, passRes, reviews] = await Promise.all([
    admin
      .from('users')
      .select('storefront_tagline, certifications, is_verified_instructor, storefront_video_url, cover_image_url')
      .eq('id', coachId)
      .maybeSingle(),
    // An INDEPENDENT coach's pass. A gym's or studio's pass belongs on its /g page.
    admin
      .from('featured_partners')
      .select('slug, business_name, pass_active')
      .eq('user_id', coachId)
      .eq('status', 'active')
      .eq('business_type', 'independent')
      .eq('pass_active', true)
      .limit(1)
      .maybeSingle(),
    fetchPublicReviews(coachId, athlete, deleted),
  ]);
  if (userRes.error) logError(userRes.error, { action: 'site.fetchCoachExtras', coachId });
  if (passRes.error) logError(passRes.error, { action: 'site.fetchCoachExtras.pass', coachId });
  const u = (userRes.data ?? {}) as {
    storefront_tagline?: string | null;
    certifications?: string[] | null;
    is_verified_instructor?: boolean | null;
    storefront_video_url?: string | null;
    cover_image_url?: string | null;
  };
  return {
    tagline: u.storefront_tagline?.trim() || null,
    certifications: (u.certifications ?? []).map((c) => c.trim()).filter(Boolean),
    verified: u.is_verified_instructor === true,
    videoUrl: u.storefront_video_url || null,
    videoPoster: u.cover_image_url || null,
    reviews,
    pass: passOf(passRes.data as PartnerPassRow | null),
  };
}

type RosterRow = {
  instructor_id: string;
  user: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    is_instructor: boolean | null;
    is_test_account: boolean | null;
    banned: boolean | null;
    deleted_at: string | null;
  } | null;
};

/** Everything /g shows beyond partners_public: the owner account, the pass, the coaches. */
export async function fetchGymExtras(partnerId: string): Promise<GymExtras> {
  const admin = getServiceRoleClient();
  try {
    const [partnerRes, rosterRes] = await Promise.all([
      // pass_active is not in partners_public; read it here rather than widen the view.
      admin
        .from('featured_partners')
        .select('user_id, slug, business_name, pass_active')
        .eq('id', partnerId)
        .maybeSingle(),
      admin
        .from('partner_instructors')
        .select(
          'instructor_id, user:users!inner(id, name, avatar_url, is_instructor, is_test_account, banned, deleted_at)'
        )
        .eq('partner_id', partnerId)
        .eq('is_active', true),
    ]);
    if (partnerRes.error) logError(partnerRes.error, { action: 'site.fetchGymExtras', partnerId });
    if (rosterRes.error) logError(rosterRes.error, { action: 'site.fetchGymExtras.roster', partnerId });
    const partner = partnerRes.data as (PartnerPassRow & { user_id: string | null }) | null;
    // Only coaches whose own /i page exists: listed (an instructor, visible).
    const roster = ((rosterRes.data ?? []) as unknown as RosterRow[])
      .map((r) => r.user)
      .filter((u): u is NonNullable<RosterRow['user']> => !!u && !!u.is_instructor && isVisibleUser(u))
      .map((u) => ({ id: u.id, name: (u.name ?? '').trim() || 'Coach', avatarUrl: u.avatar_url }));
    return { ownerId: partner?.user_id ?? null, pass: passOf(partner), roster };
  } catch (error) {
    logError(error, { action: 'site.fetchGymExtras', partnerId });
    return { ownerId: null, pass: null, roster: [] };
  }
}
