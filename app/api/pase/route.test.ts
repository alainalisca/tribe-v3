import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/pase.
 *
 * The one that matters most is "Resend is down": the row must still be there
 * and the person must still get their code. Losing a lead because an email
 * provider had a bad minute is the failure this whole route is shaped to
 * avoid, and it is invisible in production until it has already happened.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/dal/passLeads', () => ({
  fetchPassConfig: vi.fn(),
  insertPassLead: vi.fn(),
  markPassLeadNotified: vi.fn(),
}));
vi.mock('@/lib/email/passLead', () => ({
  sendPartnerLeadNotification: vi.fn(),
  sendLeadPassEmail: vi.fn(),
}));

import { POST } from './route';
import { logError } from '@/lib/logger';
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

/** Old enough to clear the two-second minimum. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'bullbox',
    name: 'Ana Ruiz',
    whatsapp: '300 111 2233',
    email: 'ana@example.com',
    choice_1: 'CrossFit',
    choice_2: 'Mañana',
    src: 'print',
    code: 'BULLBOX-01',
    consent: true,
    website: '',
    t: Date.now() - 5000,
    ...overrides,
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest('https://tribe-v3.vercel.app/api/pase', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '1.2.3.4',
      'user-agent': 'vitest',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: new Date(),
  });
  vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG);
  vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
  vi.mocked(markPassLeadNotified).mockResolvedValue(undefined);
  vi.mocked(sendPartnerLeadNotification).mockResolvedValue(undefined);
  vi.mocked(sendLeadPassEmail).mockResolvedValue(undefined);
});

describe('POST /api/pase', () => {
  it('saves the lead and returns only the three public fields', async () => {
    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Object.keys(json).sort()).toEqual(['pass_code', 'storefront_url', 'whatsapp_url']);
    expect(json.pass_code).toBe('BB-4F7K');
    expect(json.whatsapp_url).toBe(
      'https://wa.me/573001112233?text=' +
        encodeURIComponent('Hola, tengo el pase BB-4F7K de Tribe para mi clase gratis')
    );
    expect(json.storefront_url).toBe(`/storefront/${CONFIG.storefrontUserId}/?src=pase&code=BULLBOX-01`);
  });

  it('normalises the phone before storing it', async () => {
    await POST(request(validBody({ whatsapp: '300-111-2233' })));
    expect(insertPassLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ whatsapp: '+573001112233' })
    );
  });

  /** The exact input that failed on the preview, end to end through the route. */
  it('accepts a US number typed bare with its country code', async () => {
    const res = await POST(request(validBody({ whatsapp: '13472132947' })));
    expect(res.status).toBe(200);
    expect(insertPassLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ whatsapp: '+13472132947' })
    );
  });

  /**
   * The consent sentence is evidence that a person agreed to their details
   * going to a third party. A client that supplies its own chooses what it
   * appears to have agreed to.
   */
  it('stores the server-side consent sentence and ignores any the client sends', async () => {
    await POST(request(validBody({ consent_text: 'Acepto cualquier cosa' })));
    const [, lead] = vi.mocked(insertPassLead).mock.calls[0];
    expect(lead.consent_text).toContain('Autorizo a Tribe a compartir');
    expect(lead.consent_text).not.toBe('Acepto cualquier cosa');
  });

  // ── THE ONE THAT MATTERS ────────────────────────────────────────────────
  it('still saves the lead and still answers 200 when Resend throws', async () => {
    vi.mocked(sendPartnerLeadNotification).mockRejectedValue(new Error('Resend 503'));
    vi.mocked(sendLeadPassEmail).mockRejectedValue(new Error('Resend 503'));

    const res = await POST(request(validBody()));

    expect(res.status).toBe(200);
    expect((await res.json()).pass_code).toBe('BB-4F7K');
    expect(insertPassLead).toHaveBeenCalledTimes(1);
    // notified_at stays NULL: the row is the flag that someone must chase it.
    expect(markPassLeadNotified).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it('logs the pass_lead id and never the lead personal data', async () => {
    vi.mocked(sendPartnerLeadNotification).mockRejectedValue(new Error('Resend 503'));
    await POST(request(validBody()));

    const contexts = vi.mocked(logError).mock.calls.map(([, ctx]) => JSON.stringify(ctx ?? {}));
    expect(contexts.some((c) => c.includes('lead-1'))).toBe(true);
    for (const c of contexts) {
      expect(c).not.toContain('ana@example.com');
      expect(c).not.toContain('573001112233');
      expect(c).not.toContain('Ana Ruiz');
    }
  });

  it('stamps notified_at only when the partner send resolved', async () => {
    vi.mocked(sendLeadPassEmail).mockRejectedValue(new Error('Resend 503'));
    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    // The lead's own copy failing is a courtesy lost, not a notification lost.
    expect(markPassLeadNotified).toHaveBeenCalledWith(expect.anything(), 'lead-1');
  });

  it('retries on a pass_code collision and gives up after five', async () => {
    vi.mocked(insertPassLead)
      .mockResolvedValueOnce({ ok: false, reason: 'duplicate_code' })
      .mockResolvedValueOnce({ ok: false, reason: 'duplicate_code' })
      .mockResolvedValueOnce({ ok: true, id: 'lead-9', passCode: 'BB-7Y3M' });

    const res = await POST(request(validBody()));
    expect(res.status).toBe(200);
    expect((await res.json()).pass_code).toBe('BB-7Y3M');
    expect(insertPassLead).toHaveBeenCalledTimes(3);

    vi.mocked(insertPassLead).mockResolvedValue({ ok: false, reason: 'duplicate_code' });
    const res2 = await POST(request(validBody()));
    expect(res2.status).toBe(500);
  });

  describe('rejections', () => {
    it('rejects a missing consent server side, not only in the browser', async () => {
      const res = await POST(request(validBody({ consent: false })));
      expect(res.status).toBe(400);
      expect((await res.json()).field).toBe('consent');
      expect(insertPassLead).not.toHaveBeenCalled();
    });

    it('rejects consent sent as a truthy non-true value', async () => {
      for (const v of ['true', 1, 'on']) {
        vi.clearAllMocks();
        vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
        vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
        const res = await POST(request(validBody({ consent: v })));
        expect(res.status).toBe(400);
      }
    });

    it('rejects a filled honeypot', async () => {
      const res = await POST(request(validBody({ website: 'http://spam.example' })));
      expect(res.status).toBe(400);
      expect(insertPassLead).not.toHaveBeenCalled();
    });

    it('rejects a submit under two seconds', async () => {
      const res = await POST(request(validBody({ t: Date.now() - 500 })));
      expect(res.status).toBe(400);
      expect(insertPassLead).not.toHaveBeenCalled();
    });

    /**
     * The live failure this contract exists for: a US number was rejected with
     * one unplaced banner and the person had no way to know what the form
     * wanted. A validation 400 now names its field.
     */
    it.each([
      ['email', { email: 'ana@' }],
      ['name', { name: 'A' }],
      ['whatsapp', { whatsapp: '12345' }],
    ])('names %s as the field at fault', async (field, override) => {
      const res = await POST(request(validBody(override)));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.field).toBe(field);
      expect(typeof json.message).toBe('string');
      expect(json.message.length).toBeGreaterThan(0);
      expect(insertPassLead).not.toHaveBeenCalled();
    });

    it('tells someone with a valid foreign number what the form wants', async () => {
      const res = await POST(request(validBody({ whatsapp: 'not a phone' })));
      const json = await res.json();
      expect(json.field).toBe('whatsapp');
      expect(json.message).toContain('+57 300 123 4567');
      expect(json.message).toContain('+1 347 213 2947');
    });

    /**
     * The other half of the split. Naming the rule that fired would tell a
     * script exactly what to change, so these stay flat and field-less.
     */
    it('never names a field for a bot check or a rate limit', async () => {
      const honeypot = await POST(request(validBody({ website: 'http://spam.example' })));
      expect(await honeypot.json()).not.toHaveProperty('field');

      const tooFast = await POST(request(validBody({ t: Date.now() - 500 })));
      expect(await tooFast.json()).not.toHaveProperty('field');

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
      });
      const limited = await POST(request(validBody()));
      expect(limited.status).toBe(429);
      expect(await limited.json()).not.toHaveProperty('field');
    });

    it('rate limits with 429', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
      });
      const res = await POST(request(validBody()));
      expect(res.status).toBe(429);
      expect(fetchPassConfig).not.toHaveBeenCalled();
    });

    it('uses the pase: namespace so it cannot share a bucket with another form', async () => {
      await POST(request(validBody()));
      expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), 'pase:1.2.3.4', 5, 600_000);
    });

    /**
     * Unservable for three different reasons, and the client is told none of
     * them: distinguishing them enumerates which partners exist and which are
     * configured.
     */
    it('404s identically for an unknown slug and an unconfigured pass', async () => {
      vi.mocked(fetchPassConfig).mockResolvedValue(null);
      const a = await POST(request(validBody({ slug: 'does-not-exist' })));
      const b = await POST(request(validBody({ slug: 'bullbox' })));
      expect(a.status).toBe(404);
      expect(b.status).toBe(404);
      expect(await a.json()).toEqual(await b.json());
    });
  });

  describe('attribution and choices', () => {
    it('drops a malformed src or code to null rather than losing the lead', async () => {
      const res = await POST(request(validBody({ src: 'print!!<script>', code: 'x'.repeat(60) })));
      expect(res.status).toBe(200);
      const [, lead] = vi.mocked(insertPassLead).mock.calls[0];
      expect(lead.src).toBeNull();
      expect(lead.code).toBeNull();
    });

    it('falls back to the slug for storefront attribution when code was dropped', async () => {
      const res = await POST(request(validBody({ code: 'not valid!' })));
      const json = await res.json();
      expect(json.storefront_url).toBe(`/storefront/${CONFIG.storefrontUserId}/?src=pase&code=bullbox`);
    });

    it('discards a choice that is not one the partner offered', async () => {
      await POST(request(validBody({ choice_1: 'Yoga', choice_2: 'Mañana' })));
      const [, lead] = vi.mocked(insertPassLead).mock.calls[0];
      expect(lead.choice_1).toBeNull();
      expect(lead.choice_2).toBe('Mañana');
    });

    it('accepts a lead with no choices at all', async () => {
      const res = await POST(request(validBody({ choice_1: null, choice_2: null })));
      expect(res.status).toBe(200);
    });
  });
});
