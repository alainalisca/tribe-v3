/**
 * /api/admin/users/[id]/card-photo (T-SHARE1 Part C): an admin sets the photo
 * any coach's share card shows, the same pick the coach makes on their own
 * profile editor.
 *
 * GET returns what the picker needs: the coach's gallery (cover and photos in
 * Tribe storage, minus anything in card_photo_rejects) and the current pick.
 * POST { url, box } saves the pick. The url must be one of that coach's own
 * gallery photos, in Tribe storage and not rejected; the box is fractions.
 *
 * requireApiAdmin first (the caller's own session, is_app_admin()); only then
 * the service-role client, which can read card_photo_rejects (no client role
 * can, migration 220) and write another user's row.
 */
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { isTribeStorageUrl } from '@/lib/coachLink';
import { logError } from '@/lib/logger';
import { isCardBox } from '@/lib/og/cardCrop';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'Cache-Control': 'private, no-store' };

type Row = {
  id: string;
  card_photo_url: string | null;
  card_photo_box: unknown;
  card_photo_rejects: string[] | null;
  cover_image_url: string | null;
  photos: string[] | null;
};

/** The coach's photos the card may use: their cover and gallery, in Tribe storage, not rejected. */
function gallery(row: Row): string[] {
  const rejects = new Set(row.card_photo_rejects ?? []);
  return [...new Set([row.cover_image_url, ...(row.photos ?? [])])].filter(
    (u): u is string => isTribeStorageUrl(u) && !rejects.has(u!)
  );
}

async function load(service: Awaited<ReturnType<typeof requireApiAdmin>> & { ok: true }, id: string) {
  const { data, error } = await service.service
    .from('users')
    .select('id, card_photo_url, card_photo_box, card_photo_rejects, cover_image_url, photos')
    .eq('id', id)
    .maybeSingle();
  if (error) logError(error, { action: 'admin.cardPhoto.load', userId: id });
  return (data as Row | null) ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });
  const row = await load(gate, id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVATE });
  return NextResponse.json(
    {
      photos: gallery(row),
      url: row.card_photo_url,
      box: isCardBox(row.card_photo_box) ? row.card_photo_box : null,
    },
    { headers: PRIVATE }
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });

  let body: { url?: unknown; box?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: PRIVATE });
  }
  const row = await load(gate, id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVATE });
  if (typeof body.url !== 'string' || !gallery(row).includes(body.url) || !isCardBox(body.box)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });
  }

  const { error } = await gate.service
    .from('users')
    .update({ card_photo_url: body.url, card_photo_box: body.box })
    .eq('id', id);
  if (error) {
    logError(error, { action: 'admin.cardPhoto.save', userId: id });
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
  }
  return NextResponse.json({ success: true }, { headers: PRIVATE });
}
