import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * T-MOM1: "Entregar". Every tag on this session's photos that is not
 * delivered yet (and not removed, on a photo not deleted) is delivered now,
 * and each person gets ONE notification for the batch with their count, never
 * one per photo. Until this runs nothing is visible to the tagged people, so
 * tagging can happen over two sittings. Invites are returned with their
 * counts for the "Enviar por WhatsApp" step (Part C); Tribe sends them
 * nothing.
 */
export type DeliverableTag = { id: string; media_id: string; user_id: string | null; invite_id: string | null };

export function planDelivery(tags: DeliverableTag[]): {
  tagIds: string[];
  perUser: Map<string, number>;
  perInvite: Map<string, number>;
  photos: number;
} {
  const perUser = new Map<string, number>();
  const perInvite = new Map<string, number>();
  for (const t of tags) {
    if (t.user_id) perUser.set(t.user_id, (perUser.get(t.user_id) ?? 0) + 1);
    else if (t.invite_id) perInvite.set(t.invite_id, (perInvite.get(t.invite_id) ?? 0) + 1);
  }
  return { tagIds: tags.map((t) => t.id), perUser, perInvite, photos: new Set(tags.map((t) => t.media_id)).size };
}

export type DeliveryResult = {
  photos: number;
  people: number;
  invites: Array<{ id: string; name: string; phone: string | null; count: number }>;
};

export async function deliverSessionMoments(
  service: SupabaseClient,
  sessionId: string,
  notify: (userId: string, count: number) => Promise<void>
): Promise<DeliveryResult> {
  const { data: media, error: mErr } = await service
    .from('session_media')
    .select('id')
    .eq('session_id', sessionId)
    .is('deleted_at', null);
  if (mErr) throw mErr;
  const ids = (media ?? []).map((m: { id: string }) => m.id);
  if (ids.length === 0) return { photos: 0, people: 0, invites: [] };

  const { data: tags, error: tErr } = await service
    .from('session_media_tags')
    .select('id, media_id, user_id, invite_id')
    .in('media_id', ids)
    .is('delivered_at', null)
    .is('removed_at', null);
  if (tErr) throw tErr;
  const plan = planDelivery((tags ?? []) as DeliverableTag[]);
  if (plan.tagIds.length === 0) return { photos: 0, people: 0, invites: [] };

  const { error: uErr } = await service
    .from('session_media_tags')
    .update({ delivered_at: new Date().toISOString() })
    .in('id', plan.tagIds);
  if (uErr) throw uErr;

  // One notification per person, after the tags are delivered (so the link
  // they open already shows the photos). A failed push never undoes delivery.
  await Promise.all([...plan.perUser].map(([userId, count]) => notify(userId, count).catch(() => undefined)));

  let invites: DeliveryResult['invites'] = [];
  if (plan.perInvite.size) {
    const { data } = await service
      .from('media_invites')
      .select('id, display_name, phone')
      .in('id', [...plan.perInvite.keys()]);
    invites = ((data ?? []) as Array<{ id: string; display_name: string; phone: string | null }>).map((i) => ({
      id: i.id,
      name: i.display_name,
      phone: i.phone,
      count: plan.perInvite.get(i.id) ?? 0,
    }));
  }
  return { photos: plan.photos, people: plan.perUser.size + plan.perInvite.size, invites };
}
