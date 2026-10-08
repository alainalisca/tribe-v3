import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T-GROW1 part B: the seven attribution columns reach the lead row.
 *
 * WHAT THIS FILE IS FOR, AND WHAT route.flagoff.test.ts ALREADY COVERS.
 *
 * flagoff pins the EXACT insert payload, so it already proves the seven keys are
 * present and null on an untagged lead. What it cannot show is any of the
 * behaviour, because its two cases both send canonical values. So this file is
 * the behaviour:
 *
 *   * all seven land, with the values sent;
 *   * casing is NORMALISED, which is the one behaviour change to an existing
 *     code path and the reason the Origen tab can group at all;
 *   * a malformed value becomes NULL AND THE LEAD IS STILL SAVED -- the property
 *     173 settled and migration 211's size-only CHECKs are sized to preserve;
 *   * first_touch is revalidated rather than stored as received, because it is
 *     the one jsonb column on a table reachable from a public endpoint.
 *
 * The last two are the ones that matter. A rejected insert here does not cost a
 * field, it costs a person who was standing in a gym typing their phone number.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/pase/passCode', () => ({ generatePassCode: vi.fn(() => 'BB-4F7K') }));
vi.mock('@/lib/dal/passLeads', () => ({
  fetchPassConfig: vi.fn(),
  insertPassLead: vi.fn(),
  markPassLeadNotified: vi.fn(),
}));
vi.mock('@/lib/email/passLead', () => ({
  sendPartnerLeadNotification: vi.fn(),
  sendLeadPassEmail: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  })),
}));

import { POST } from './route';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchPassConfig, insertPassLead, markPassLeadNotified } from '@/lib/dal/passLeads';
import { sendPartnerLeadNotification, sendLeadPassEmail } from '@/lib/email/passLead';

const CONFIG = {
  partnerId: '040cbc21-1b11-4ae1-aa99-9fe35a32bda0',
  slug: 'bullbox',
  partnerName: 'CrossFit BullBox',
  businessType: 'gym',
  address: 'Cra 43G #25a-50, El Poblado, Medellín',
  logoUrl: null,
  storefrontUserId: '0df617e9-7547-4a8d-a0b1-8be4d52a673a',
  headline: 'Tu primera clase gratis en BullBox',
  sub: 'CrossFit y HYROX en Ciudad del Río',
  options: { tipo: ['CrossFit', 'HYROX'], horario: ['Mañana', 'Tarde / noche'] },
  leadWhatsapp: '+573001112233',
  leadEmail: 'leo@bullbox.co',
  leadCc: ['hola@tribe.co'],
};

function request(payload: Record<string, unknown>): NextRequest {
  return new NextRequest('https://tribe-v3.vercel.app/api/pase', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'vitest' },
    body: JSON.stringify({
      slug: 'bullbox',
      name: 'Ana Ruiz',
      whatsapp: '300 111 2233',
      email: 'ana@example.com',
      choice_1: 'CrossFit',
      choice_2: 'Mañana',
      consent: true,
      website: '',
      t: Date.now() - 5000,
      ...payload,
    }),
  });
}

/** The insert payload the route actually sent. */
function inserted(): Record<string, unknown> {
  return vi.mocked(insertPassLead).mock.calls[0][1] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG as never);
  vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
  vi.mocked(markPassLeadNotified).mockResolvedValue(undefined);
  vi.mocked(sendPartnerLeadNotification).mockResolvedValue(undefined);
  vi.mocked(sendLeadPassEmail).mockResolvedValue(undefined);
});

const FULL = {
  src: 'runclub',
  code: 'RUNCLUB-SAT0927',
  ref: 'A7K2QX',
  utm_source: 'instagram',
  utm_medium: 'social',
  utm_campaign: 'hyrox-oct',
  utm_content: 'reel-01',
  landing_path: '/pase/bullbox/',
  first_touch: {
    src: 'runclub',
    code: 'RUNCLUB-SAT0927',
    ref: 'A7K2QX',
    utm_source: 'instagram',
    utm_medium: 'social',
    utm_campaign: 'hyrox-oct',
    utm_content: 'reel-01',
    landing_path: '/pase/bullbox/',
    ts: 1_760_000_000_000,
  },
};

describe('POST /api/pase persists T-GROW1 attribution', () => {
  it('writes all seven columns from a fully tagged submission', async () => {
    const res = await POST(request(FULL));
    expect(res.status).toBe(200);

    const row = inserted();
    // attr_ref, NOT ref. The parameter is ?ref= and the column is attr_ref,
    // because migrationAppliedBeforeCode.test.ts matches a column name as a
    // substring of source and "ref" appears in 708 source files. This assertion
    // is the one place the two names meet.
    expect(row.attr_ref).toBe('A7K2QX');
    expect(row.utm_source).toBe('instagram');
    expect(row.utm_medium).toBe('social');
    expect(row.utm_campaign).toBe('hyrox-oct');
    expect(row.utm_content).toBe('reel-01');
    expect(row.landing_path).toBe('/pase/bullbox/');
    expect(row.first_touch).toMatchObject({ src: 'runclub', ts: 1_760_000_000_000 });
  });

  it('normalises casing: channels down, printed codes up', async () => {
    await POST(
      request({
        src: 'RunClub',
        code: 'runclub-sat0927',
        ref: 'a7k2qx',
        utm_source: 'Instagram',
        utm_campaign: 'Hyrox-Oct',
      })
    );
    const row = inserted();
    // THE REASON THE ORIGEN TAB CAN GROUP. Stored as typed, `Instagram` and
    // `instagram` are two rows that each look too small to act on, and one
    // channel reads as two.
    expect(row.src).toBe('runclub');
    expect(row.utm_source).toBe('instagram');
    expect(row.utm_campaign).toBe('hyrox-oct');
    // Uppercased because these are printed on posters and read out loud, so the
    // one on the poster is the uppercase one.
    expect(row.code).toBe('RUNCLUB-SAT0927');
    expect(row.attr_ref).toBe('A7K2QX');
  });

  it('drops a malformed value to null AND STILL SAVES THE LEAD', async () => {
    const res = await POST(
      request({
        src: 'run club',
        code: 'A'.repeat(41),
        utm_campaign: '<script>',
        ref: 'ok-ref',
      })
    );

    // The assertion that matters, and it is the status rather than the columns.
    // A 400 here would mean a typo on a printed poster costs a real lead, which
    // is the trade 173's sanitizeTag refused and the reason migration 211 bounds
    // these columns by size only.
    expect(res.status).toBe(200);
    expect(insertPassLead).toHaveBeenCalledTimes(1);

    const row = inserted();
    expect(row.src).toBeNull();
    expect(row.code).toBeNull();
    expect(row.utm_campaign).toBeNull();
    // The good field beside the bad ones survives: one typo must not take the
    // whole attribution with it.
    expect(row.attr_ref).toBe('OK-REF');
  });

  it('nulls first_touch when it is not an object, and still saves the lead', async () => {
    for (const bad of ['a string', 42, [1, 2, 3], null, true]) {
      vi.clearAllMocks();
      vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
      vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG as never);
      vi.mocked(getServiceRoleClient).mockReturnValue({} as never);

      const res = await POST(request({ src: 'runclub', first_touch: bad }));
      expect(res.status, `first_touch: ${JSON.stringify(bad)}`).toBe(200);
      expect(inserted().first_touch, `first_touch: ${JSON.stringify(bad)}`).toBeNull();
    }
  });

  it('revalidates first_touch field by field rather than storing it as received', async () => {
    await POST(
      request({
        src: 'runclub',
        first_touch: {
          src: 'Instagram',
          code: 'not a code',
          // A field nobody declared. It must not reach the column: this is the one
          // jsonb write target on pass_leads reachable from a public endpoint, and
          // an unvalidated passthrough is an unbounded one.
          injected: 'x'.repeat(5000),
          ts: 1_760_000_000_000,
        },
      })
    );
    const ft = inserted().first_touch as Record<string, unknown>;
    expect(ft.src).toBe('instagram');
    expect(ft.code).toBeNull();
    expect(ft).not.toHaveProperty('injected');
    // Nine keys exactly: the seven tags, landing_path and ts.
    expect(Object.keys(ft).sort()).toEqual([
      'code',
      'landing_path',
      'ref',
      'src',
      'ts',
      'utm_campaign',
      'utm_content',
      'utm_medium',
      'utm_source',
    ]);
  });

  it('nulls first_touch when its ts is missing or not a number', async () => {
    for (const ts of [undefined, 'yesterday', NaN, Infinity]) {
      vi.clearAllMocks();
      vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
      vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG as never);
      vi.mocked(getServiceRoleClient).mockReturnValue({} as never);

      await POST(request({ src: 'runclub', first_touch: { src: 'runclub', ts } }));
      // A first touch with no trustworthy timestamp cannot say when the arrival
      // happened, and that is the only thing it adds over the flat columns. The
      // lead keeps its src either way, so rejecting costs the blob and nothing more.
      expect(inserted().first_touch, `ts: ${String(ts)}`).toBeNull();
      expect(inserted().src).toBe('runclub');
    }
  });

  it('passes utm_campaign to the partner email so "Llegó por" shows it', async () => {
    await POST(request(FULL));
    const params = vi.mocked(sendPartnerLeadNotification).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(params.src).toBe('runclub');
    expect(params.code).toBe('RUNCLUB-SAT0927');
    expect(params.utmCampaign).toBe('hyrox-oct');
  });

  /**
   * THE OAUTH CALLBACK INCIDENT, lead side.
   *
   * Lead TR-C3LU reached production with first_touch carrying
   * code=FF275D19-D6B0-40DD-9C19-695C59BDC0C9 and landing_path=/auth/callback/.
   *
   * THE CHOICE HERE IS THE OPPOSITE OF /api/attr's, deliberately. There the whole
   * row is the visit, so a callback landing page makes it meaningless and it is
   * refused. Here the row is a PERSON WHO LEFT THEIR PHONE NUMBER, and 173's rule
   * holds: never lose a lead over a query-string problem. The field goes to NULL
   * and the lead is saved.
   */
  it('nulls a callback landing path and STILL SAVES THE LEAD', async () => {
    const res = await POST(
      request({ src: 'runclub', code: 'FF275D19-D6B0-40DD-9C19-695C59BDC0C9', landing_path: '/auth/callback/' })
    );
    expect(res.status).toBe(200);
    expect(insertPassLead).toHaveBeenCalledTimes(1);
    const row = inserted();
    expect(row.landing_path).toBeNull();
    // The UUID code is gone by the value rule, and the real src survives.
    expect(row.code).toBeNull();
    expect(row.src).toBe('runclub');
  });

  it('refuses a first_touch captured on the callback, whole', async () => {
    await POST(
      request({
        src: 'runclub',
        first_touch: {
          code: 'FF275D19-D6B0-40DD-9C19-695C59BDC0C9',
          landing_path: '/auth/callback/',
          ts: 1_760_000_000_000,
        },
      })
    );
    // This is the blob TR-C3LU carried. Refused entirely rather than filtered:
    // the landing page is what makes the whole record not a campaign.
    expect(inserted().first_touch).toBeNull();
    expect(inserted().src).toBe('runclub');
  });

  it('drops code but keeps ref on a non-callback auth path', async () => {
    await POST(request({ ref: 'A7K2QX', code: 'IG-REEL-01', landing_path: '/auth/' }));
    const row = inserted();
    expect(row.code).toBeNull();
    expect(row.attr_ref).toBe('A7K2QX');
  });

  it('refuses a UUID as a code on an ordinary path', async () => {
    await POST(
      request({ src: 'runclub', code: 'FF275D19-D6B0-40DD-9C19-695C59BDC0C9', landing_path: '/pase/bullbox/' })
    );
    expect(inserted().code).toBeNull();
    expect(inserted().landing_path).toBe('/pase/bullbox/');
  });
});
