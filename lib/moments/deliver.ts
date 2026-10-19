import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/http/siteUrl';

/**
 * T-MOM1: "Entregar". Every tag on this session's photos that is not
 * delivered yet (and not removed, on a photo not deleted) is delivered now,
 * and each person gets ONE notification for the batch with their count, never
 * one per photo. Until this runs nothing is visible to the tagged people, so
 * tagging can happen over two sittings. Invites are returned with their
 * counts and claim links for the "Enviar por WhatsApp" step; Tribe sends
 * them nothing. Each person's first photo (in the session's photo order) goes
 * to the notifier, for the email fallback's thumbnail.
 */
export type DeliverableTag = { id: string; media_id: string; user_id: string | null; invite_id: string | null };

export function planDelivery(
  tags: DeliverableTag[],
  mediaOrder: string[] = []
): {
  tagIds: string[];
  perUser: Map<string, number>;
  perInvite: Map<string, number>;
  firstMedia: Map<string, string>;
  photos: number;
} {
  const perUser = new Map<string, number>();
  const perInvite = new Map<string, number>();
  const firstMedia = new Map<string, string>();
  const rank = (id: string) => {
    const i = mediaOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  for (const t of tags) {
    if (t.user_id) {
      perUser.set(t.user_id, (perUser.get(t.user_id) ?? 0) + 1);
      const first = firstMedia.get(t.user_id);
      if (!first || rank(t.media_id) < rank(first)) firstMedia.set(t.user_id, t.media_id);
    } else if (t.invite_id) perInvite.set(t.invite_id, (perInvite.get(t.invite_id) ?? 0) + 1);
  }
  return {
    tagIds: tags.map((t) => t.id),
    perUser,
    perInvite,
    firstMedia,
    photos: new Set(tags.map((t) => t.media_id)).size,
  };
}

/** The claim link an invite's WhatsApp message carries. */
export function claimLink(token: string): string {
  return `${SITE_URL}/m/${token}/`;
}

export type DeliveryResult = {
  photos: number;
  people: number;
  invites: Array<{ id: string; name: string; phone: string | null; count: number; link: string }>;
};

export async function deliverSessionMoments(
  service: SupabaseClient,
  sessionId: string,
  notify: (userId: string, count: number, firstPath: string | null) => Promise<void>
): Promise<DeliveryResult> {
  const { data: media, error: mErr } = await service
    .from('session_media')
    .select('id, storage_path')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('taken_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (mErr) throw mErr;
  const rows = (media ?? []) as Array<{ id: string; storage_path: string }>;
  const ids = rows.map((m) => m.id);
  const pathOf = new Map(rows.map((m) => [m.id, m.storage_path]));
  if (ids.length === 0) return { photos: 0, people: 0, invites: [] };

  const { data: tags, error: tErr } = await service
    .from('session_media_tags')
    .select('id, media_id, user_id, invite_id')
    .in('media_id', ids)
    .is('delivered_at', null)
    .is('removed_at', null);
  if (tErr) throw tErr;
  const plan = planDelivery((tags ?? []) as DeliverableTag[], ids);
  if (plan.tagIds.length === 0) return { photos: 0, people: 0, invites: [] };

  const { error: uErr } = await service
    .from('session_media_tags')
    .update({ delivered_at: new Date().toISOString() })
    .in('id', plan.tagIds);
  if (uErr) throw uErr;

  // One notification per person, after the tags are delivered (so the link
  // they open already shows the photos). A failed push never undoes delivery.
  await Promise.all(
    [...plan.perUser].map(([userId, count]) =>
      notify(userId, count, pathOf.get(plan.firstMedia.get(userId) ?? '') ?? null).catch(() => undefined)
    )
  );

  let invites: DeliveryResult['invites'] = [];
  if (plan.perInvite.size) {
    const { data } = await service
      .from('media_invites')
      .select('id, display_name, phone, token')
      .in('id', [...plan.perInvite.keys()]);
    invites = ((data ?? []) as Array<{ id: string; display_name: string; phone: string | null; token: string }>).map(
      (i) => ({
        id: i.id,
        name: i.display_name,
        phone: i.phone,
        count: plan.perInvite.get(i.id) ?? 0,
        link: claimLink(i.token),
      })
    );
  }
  return { photos: plan.photos, people: plan.perUser.size + plan.perInvite.size, invites };
}
