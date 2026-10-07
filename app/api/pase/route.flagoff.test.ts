import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T-AV23 acceptance 1 and 2: with the `athletes` flag off, POST /api/pase is
 * byte-for-byte what it was before T-AV23.
 *
 * WRITTEN FIRST, AGAINST THE UNMODIFIED ROUTE (2026-09-30), and run green
 * before route.ts was touched. Every expectation below is a LITERAL recorded
 * from that route, not a call into the code under test, so nothing T-AV23
 * changes can move the goalposts: the response body, the exact insert payload
 * and the exact arguments to both emails.
 *
 * Three ways to be "off" for athletes, each with and without an athlete link:
 *   ATHLETE_VALUE_ENABLED unset, set to "off", and "all" with a feature list
 *   that does not name `athletes`.
 *
 * Two traps make "no attribution work happened" observable rather than
 * inferred from the output:
 *   - the service-role client's `from()` throws: flag off must not query
 *     athlete_programs or program_athletes at all;
 *   - '@/lib/supabase/server' is mocked with a signed-in APP ADMIN whose
 *     is_app_admin answers true. The anonymous path must never read a session
 *     (D11), so the admin rule cannot turn attribution on (spec section 3).
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
const serverClient = vi.hoisted(() => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } } }) },
    rpc: async () => ({ data: true, error: null }),
  })),
}));
vi.mock('@/lib/supabase/server', () => serverClient);

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

function body(src: string | null, code: string | null) {
  return {
    slug: 'bullbox',
    name: 'Ana Ruiz',
    whatsapp: '300 111 2233',
    email: 'ana@example.com',
    choice_1: 'CrossFit',
    choice_2: 'Mañana',
    src,
    code,
    consent: true,
    website: '',
    t: Date.now() - 5000,
  };
}

function request(payload: unknown): NextRequest {
  return new NextRequest('https://tribe-v3.vercel.app/api/pase', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'vitest' },
    body: JSON.stringify(payload),
  });
}

// ── Recorded from the unmodified route, 2026-09-30 ──────────────────────────
const CONSENT =
  'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con CrossFit BullBox para que me contacte sobre mi clase gratis.';
const WHATSAPP_URL =
  'https://wa.me/573001112233?text=Hola%2C%20tengo%20el%20pase%20BB-4F7K%20de%20Tribe%20para%20mi%20clase%20gratis';
const storefront = (tag: string) =>
  `/storefront/0df617e9-7547-4a8d-a0b1-8be4d52a673a/?src=pase&code=${encodeURIComponent(tag)}`;

const CASES = [
  { label: 'no attribution in the link', src: null, code: null, storefrontTag: 'bullbox' },
  { label: 'an athlete link (?src=atleta&code=ANA-7KQ)', src: 'atleta', code: 'ANA-7KQ', storefrontTag: 'ANA-7KQ' },
];
const FLAG_OFF_ENVS: Array<{ label: string; env: Record<string, string | undefined> }> = [
  {
    label: 'ATHLETE_VALUE_ENABLED unset',
    env: { ATHLETE_VALUE_ENABLED: undefined, ATHLETE_VALUE_FEATURES: undefined },
  },
  { label: 'ATHLETE_VALUE_ENABLED=off', env: { ATHLETE_VALUE_ENABLED: 'off', ATHLETE_VALUE_FEATURES: undefined } },
  {
    label: 'all, but athletes not in ATHLETE_VALUE_FEATURES',
    env: { ATHLETE_VALUE_ENABLED: 'all', ATHLETE_VALUE_FEATURES: 'tribe-os' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceRoleClient).mockReturnValue({
    from: () => {
      throw new Error('flag off must not query any table through the service role');
    },
    rpc: () => {
      throw new Error('flag off must not call any RPC through the service role');
    },
  } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG);
  vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
  vi.mocked(markPassLeadNotified).mockResolvedValue(undefined);
  vi.mocked(sendPartnerLeadNotification).mockResolvedValue(undefined);
  vi.mocked(sendLeadPassEmail).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/pase with the athletes flag off is identical to before T-AV23', () => {
  for (const flag of FLAG_OFF_ENVS) {
    for (const c of CASES) {
      it(`${flag.label}, ${c.label}: same body, same row, same emails, no session read`, async () => {
        for (const [k, v] of Object.entries(flag.env)) vi.stubEnv(k, v as string);

        const res = await POST(request(body(c.src, c.code)));

        expect(res.status).toBe(200);
        expect(await res.json()).toStrictEqual({
          pass_code: 'BB-4F7K',
          whatsapp_url: WHATSAPP_URL,
          storefront_url: storefront(c.storefrontTag),
        });

        expect(insertPassLead).toHaveBeenCalledTimes(1);
        expect(vi.mocked(insertPassLead).mock.calls[0][1]).toStrictEqual({
          slug: 'bullbox',
          partner_id: '040cbc21-1b11-4ae1-aa99-9fe35a32bda0',
          name: 'Ana Ruiz',
          whatsapp: '+573001112233',
          email: 'ana@example.com',
          choice_1: 'CrossFit',
          choice_2: 'Mañana',
          src: c.src,
          code: c.code,
          pass_code: 'BB-4F7K',
          consent_text: CONSENT,
          user_agent: 'vitest',
        });

        expect(sendPartnerLeadNotification).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendPartnerLeadNotification).mock.calls[0][0]).toStrictEqual({
          to: 'leo@bullbox.co',
          cc: ['hola@tribe.co'],
          partnerName: 'CrossFit BullBox',
          name: 'Ana Ruiz',
          whatsapp: '+573001112233',
          email: 'ana@example.com',
          choice1: 'CrossFit',
          choice2: 'Mañana',
          passCode: 'BB-4F7K',
          src: c.src,
          code: c.code,
          createdAt: expect.any(Date),
        });
        expect(sendLeadPassEmail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendLeadPassEmail).mock.calls[0][0]).toStrictEqual({
          to: 'ana@example.com',
          name: 'Ana Ruiz',
          partnerName: 'CrossFit BullBox',
          address: 'Cra 43G #25a-50, El Poblado, Medellín',
          passCode: 'BB-4F7K',
          whatsappUrl: WHATSAPP_URL,
          storefrontUrl: storefront(c.storefrontTag),
        });

        // The anonymous path never reads a session, admin or otherwise.
        expect(serverClient.createClient).not.toHaveBeenCalled();
      });
    }
  }
});
