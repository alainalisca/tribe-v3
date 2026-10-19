import { NextResponse } from 'next/server';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { deliverSessionMoments } from '@/lib/moments/deliver';
import { makeMomentsNotifier } from '@/lib/moments/notify';
import { hostFirstName } from '@/lib/share/sessionPublic';
import { translateSport } from '@/lib/sportTranslationData';
import { whatsappHref, whatsappText } from '@/lib/moments/whatsapp';
import { logError } from '@/lib/logger';

/**
 * POST /api/moments/<session>/deliver/ (T-MOM1): "Entregar". One notification
 * per tagged person. Each invite with a phone comes back with its "Enviar por
 * WhatsApp" link, the message in the uploader's language (Spanish unless they
 * use the app in English).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  try {
    const { data: s } = await g.service
      .from('sessions')
      .select('title, sport, creator_id')
      .eq('id', sessionId)
      .maybeSingle();
    const session = s as { title: string | null; sport: string | null; creator_id: string | null } | null;
    const { data: host } = session?.creator_id
      ? await g.service.from('users').select('name').eq('id', session.creator_id).maybeSingle()
      : { data: null };
    const creatorName = (host as { name?: string } | null)?.name ?? null;
    const notify = makeMomentsNotifier(g.service, {
      sessionId,
      actorId: g.user.id,
      session: { title: session?.title ?? null, sport: session?.sport ?? null, creatorName },
    });
    const result = await deliverSessionMoments(g.service, sessionId, notify);
    const { data: me } = await g.service.from('users').select('preferred_language').eq('id', g.user.id).maybeSingle();
    const lang = (me as { preferred_language?: string | null } | null)?.preferred_language === 'en' ? 'en' : 'es';
    const sport = session?.sport ?? null;
    const name =
      session?.title?.trim() ||
      (sport && sport !== 'Other' ? translateSport(sport, lang) : lang === 'en' ? 'the session' : 'la sesión');
    const coach = hostFirstName(creatorName, sport);
    const invites = result.invites.map((i) => ({
      ...i,
      whatsappUrl: i.phone ? whatsappHref(i.phone, whatsappText(lang, name, coach, i.link)) : null,
    }));
    return NextResponse.json({ ...result, invites }, { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.deliver', sessionId });
    return fail(500, 'deliver_failed');
  }
}
