import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * /api/instructor/notify-interest writes the instructor's bell and push in the
 * INSTRUCTOR's language (T-LANG1), not the athlete's, and only when the
 * athlete's training_interest row exists.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/dal', () => ({ createNotification: vi.fn() }));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { createNotification } from '@/lib/dal';

const ATHLETE = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const INSTRUCTOR = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const CHOSE = '2026-10-20T12:00:00Z';

function mockService(opts: {
  instructor: Record<string, unknown> | null;
  athleteName?: string | null;
  interest?: boolean;
}) {
  vi.mocked(getServiceRoleClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'training_interest') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: opts.interest ? { id: 'ti-1' } : null, error: null }),
              }),
            }),
          }),
        };
      }
      // users: the instructor first, then the athlete's name.
      return {
        select: (cols: string) => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: id === INSTRUCTOR ? opts.instructor : cols === 'name' ? { name: opts.athleteName ?? 'Ana' } : null,
              error: null,
            }),
          }),
        }),
      };
    },
  } as never);
}

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/instructor/notify-interest', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

describe('POST /api/instructor/notify-interest', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: ATHLETE } } }) },
    } as never);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(createNotification).mockResolvedValue({ success: true } as never);
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('an instructor who never chose gets the bell and the push in Spanish', async () => {
    mockService({
      instructor: { id: INSTRUCTOR, is_instructor: true, preferred_language: 'en', preferred_language_set_at: null },
      interest: true,
    });
    const res = await POST(req({ instructor_id: INSTRUCTOR }));
    expect(res.status).toBe(200);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: INSTRUCTOR,
        actor_id: ATHLETE,
        type: 'training_interest',
        message: 'Un atleta está interesado en entrenar contigo',
      })
    );
    const push = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(push.title).toBe('👋 Nuevo interés de entrenamiento');
    expect(push.body).toBe('Ana está interesado en entrenar contigo');
  });

  it('an instructor who chose English gets English', async () => {
    mockService({
      instructor: { id: INSTRUCTOR, is_instructor: true, preferred_language: 'en', preferred_language_set_at: CHOSE },
      interest: true,
    });
    await POST(req({ instructor_id: INSTRUCTOR }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'An athlete is interested in training with you' })
    );
    const push = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(push.title).toBe('👋 New training interest');
  });

  it('no interest row: no bell, no push', async () => {
    mockService({
      instructor: { id: INSTRUCTOR, is_instructor: true, preferred_language: 'es', preferred_language_set_at: CHOSE },
      interest: false,
    });
    const res = await POST(req({ instructor_id: INSTRUCTOR }));
    expect(await res.json()).toMatchObject({ success: true, skipped: true });
    expect(createNotification).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('not an instructor: no bell, no push', async () => {
    mockService({ instructor: { id: INSTRUCTOR, is_instructor: false }, interest: true });
    await POST(req({ instructor_id: INSTRUCTOR }));
    expect(createNotification).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a failed bell is logged and the push still goes', async () => {
    vi.mocked(createNotification).mockResolvedValue({ success: false, error: 'rls' } as never);
    mockService({
      instructor: { id: INSTRUCTOR, is_instructor: true, preferred_language: 'es', preferred_language_set_at: CHOSE },
      interest: true,
    });
    const res = await POST(req({ instructor_id: INSTRUCTOR }));
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
