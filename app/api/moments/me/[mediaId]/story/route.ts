import { fail, guardMe, PRIVATE } from '@/lib/moments/routeGuard';
import { loadMyTag, storyInputs } from '@/lib/moments/myActions';
import { renderStory } from '@/lib/moments/story';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/moments/me/<media>/story/ (T-MOM1 Part D): "Compartir", the 1080 x
 * 1920 story image of a photo the signed-in person is tagged in (and no other).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  const g = await guardMe(mediaId);
  if (!g.ok) return g.res;
  const tag = await loadMyTag(g.service, g.user.id, mediaId);
  if (!tag) return fail(404, 'not_found');
  try {
    const inputs = await storyInputs(g.service, g.user.id, tag);
    if (!inputs) return fail(404, 'not_found');
    const jpeg = await renderStory(inputs);
    return new Response(new Uint8Array(jpeg), {
      headers: {
        ...PRIVATE,
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment; filename="tribe-momento.jpg"',
      },
    });
  } catch (error) {
    logError(error, { action: 'moments.me.story', mediaId });
    return fail(500, 'story_failed');
  }
}
