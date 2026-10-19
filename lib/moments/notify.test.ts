import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  deleteRequestMessage,
  makeMomentsNotifier,
  momentosHref,
  momentsEmailHtml,
  momentsMessage,
  sessionOfDay,
  thanksMessage,
} from './notify';

describe('momentsMessage (T-MOM1)', () => {
  it('one line, singular and plural, in both languages', () => {
    expect(momentsMessage(6, 'Boxeo con Salomon', 'es')).toBe('Tienes 6 fotos nuevas de Boxeo con Salomon');
    expect(momentsMessage(1, 'Boxeo con Salomon', 'es')).toBe('Tienes 1 foto nueva de Boxeo con Salomon');
    expect(momentsMessage(2, 'Boxing with Salomon', 'en')).toBe('You have 2 new photos from Boxing with Salomon');
  });
});

const sent = vi.hoisted(() => ({ emails: [] as Array<{ to: string; subject: string; html: string }> }));
vi.mock('@/lib/email/resendClient', () => ({
  getResendClient: () => ({
    emails: {
      send: async (p: { to: string; subject: string; html: string }) => {
        sent.emails.push(p);
        return { data: { id: 'x' }, error: null };
      },
    },
  }),
}));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: async () => ({ success: true }) }));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: async () => true }));
vi.mock('@/lib/dal/emailUnsubscribe', () => ({ isEmailSuppressed: async () => false }));

describe('Part C notices (T-MOM1)', () => {
  it('the deep link opens the session batch in Momentos', () => {
    expect(momentosHref('11111111-1111-4111-8111-111111111111')).toBe(
      '/profile/momentos/?s=11111111-1111-4111-8111-111111111111'
    );
  });

  it('thanks and delete-request lines, both languages', () => {
    const day = sessionOfDay({ title: null, sport: 'Boxing', date: '2026-10-13' }, 'es');
    expect(day).toBe('Boxeo del martes');
    expect(thanksMessage('Juan', day, 'es')).toBe('Juan te dio las gracias por las fotos de Boxeo del martes');
    expect(deleteRequestMessage('Juan', day, 'es')).toBe('Juan pidió que borres una foto de Boxeo del martes');
    const en = sessionOfDay({ title: null, sport: 'Boxing', date: '2026-10-13' }, 'en');
    expect(thanksMessage('Juan', en, 'en')).toBe('Juan thanked you for the photos from Boxing on Tuesday');
  });

  it('the email is one line, one 400 px photo, one link, escaped', () => {
    const html = momentsEmailHtml('Tienes 6 fotos <b>', 'https://x/t.webp', 'https://tribelatam.com/p', 'es');
    expect(html).toContain('Tienes 6 fotos &lt;b&gt;');
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('width="400"');
    expect(html).toContain('Ver mis fotos');
  });
});

describe('one notification per delivered batch: push, and email only without a push token (T-MOM1)', () => {
  const env = { ...process.env };
  beforeEach(() => {
    sent.emails = [];
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tribelatam.com';
    process.env.CRON_SECRET = 'c';
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { preferred_language: 'es', email: 'ana@example.com' } }) }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://s/thumb.webp' } }) }) },
  };
  const notifier = () =>
    makeMomentsNotifier(service as never, {
      sessionId: '11111111-1111-4111-8111-111111111111',
      actorId: 'h',
      session: { title: null, sport: 'Boxing', creatorName: 'Salomon Tabares' },
    });

  it('push delivered: one push with the Momentos link, no email', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await notifier()('ana', 6, 's/m1.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.body).toBe('Tienes 6 fotos nuevas de Boxeo con Salomon');
    expect(body.url).toBe('/profile/momentos/?s=11111111-1111-4111-8111-111111111111');
    expect(sent.emails).toEqual([]);
  });

  it('no push token: one email, same line, with the thumbnail of the first photo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await notifier()('ana', 6, 's/m1.jpg');
    expect(sent.emails).toHaveLength(1);
    expect(sent.emails[0].to).toBe('ana@example.com');
    expect(sent.emails[0].subject).toBe('Tienes 6 fotos nuevas de Boxeo con Salomon');
    expect(sent.emails[0].html).toContain('https://s/thumb.webp');
    expect(sent.emails[0].html).toContain('/profile/momentos/?s=11111111-1111-4111-8111-111111111111');
  });
});
