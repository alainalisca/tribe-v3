import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T-AV23: POST /api/pase with the athletes flag ON.
 *
 * Attribution is decided here; credit is not (Al's override, 2026-09-30): a
 * self-referral or a returning guest is attributed and the ledger refuses it
 * credit, which is proven against the database by t-av23-proof.LOCAL.sh.
 * Failure paths assert that the failure was RECOGNISED (logError, with its
 * action), because "saved without attribution" is also what a route with no
 * error handling would produce.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn(() => ({})) }));
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
vi.mock('@/lib/dal/athleteReferral', () => ({
  fetchAthleteProgramStatus: vi.fn(),
  findActiveAthleteByRefCode: vi.fn(),
}));
vi.mock('@/lib/qr/renderQrSvg', () => ({ renderQrSvg: vi.fn(() => '<svg>qr</svg>') }));
vi.mock('@/lib/dal/athleteNotify', () => ({ claimLeadNotification: vi.fn() }));
vi.mock('@/lib/atletas/athleteNotifications', () => ({ deliverNotifications: vi.fn() }));

import { POST } from './route';
import { claimLeadNotification } from '@/lib/dal/athleteNotify';
import { deliverNotifications } from '@/lib/atletas/athleteNotifications';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchPassConfig, insertPassLead, markPassLeadNotified } from '@/lib/dal/passLeads';
import { sendPartnerLeadNotification, sendLeadPassEmail } from '@/lib/email/passLead';
import { fetchAthleteProgramStatus, findActiveAthleteByRefCode } from '@/lib/dal/athleteReferral';
import { renderQrSvg } from '@/lib/qr/renderQrSvg';

const CONFIG = {
  partnerId: '040cbc21-1b11-4ae1-aa99-9fe35a32bda0',
  slug: 'bullbox',
  partnerName: 'CrossFit BullBox',
  businessType: 'gym',
  address: 'Cra 43G #25a-50, El Poblado, Medellín',
  logoUrl: null,
  storefrontUserId: '0df617e9-7547-4a8d-a0b1-8be4d52a673a',
  headline: null,
  sub: null,
  options: { tipo: ['CrossFit', 'HYROX'] },
  leadWhatsapp: '+573001112233',
  leadEmail: 'leo@bullbox.co',
  leadCc: [],
};
const V1 =
  'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con CrossFit BullBox para que me contacte sobre mi clase gratis.';
const ATTRIBUTED =
  V1 +
  ' Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó. CrossFit BullBox y Tribe registrarán si asistí.';

function post(src: string | null, code: string | null, origin = 'https://tribe-v3.vercel.app') {
  return POST(
    new NextRequest(`${origin}/api/pase`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', 'user-agent': 'vitest' },
      body: JSON.stringify({
        slug: 'bullbox',
        name: 'Laura Martinez',
        whatsapp: '300 111 2233',
        email: 'laura@example.com',
        choice_1: 'CrossFit',
        src,
        code,
        consent: true,
        website: '',
        t: Date.now() - 5000,
      }),
    })
  );
}
const lead = () => vi.mocked(insertPassLead).mock.calls[0][1] as unknown as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ATHLETE_VALUE_ENABLED', 'all');
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  vi.mocked(fetchPassConfig).mockResolvedValue(CONFIG);
  vi.mocked(insertPassLead).mockResolvedValue({ ok: true, id: 'lead-1', passCode: 'BB-4F7K' });
  vi.mocked(markPassLeadNotified).mockResolvedValue(undefined);
  vi.mocked(sendPartnerLeadNotification).mockResolvedValue(undefined);
  vi.mocked(sendLeadPassEmail).mockResolvedValue(undefined);
  vi.mocked(fetchAthleteProgramStatus).mockResolvedValue({ isActive: true });
  vi.mocked(findActiveAthleteByRefCode).mockResolvedValue({ programAthleteId: 'pa-ana', firstName: 'Ana' });
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/pase, athletes flag on', () => {
  it('a valid code at the home gym: attributed, both consent lines, a voucher QR of the door URL', async () => {
    const res = await post('atleta', 'ANA-7KQ');
    expect(res.status).toBe(200);
    expect(lead().referred_by_athlete_id).toBe('pa-ana');
    expect(lead().consent_text).toBe(ATTRIBUTED);
    expect(lead().code).toBe('ANA-7KQ');
    expect(findActiveAthleteByRefCode).toHaveBeenCalledWith(expect.anything(), CONFIG.partnerId, 'ANA-7KQ');
    const body = await res.json();
    expect(body.qr_svg).toBe('<svg>qr</svg>');
    expect(renderQrSvg).toHaveBeenCalledWith(
      'https://tribe-v3.vercel.app/pase/verificar/BB-4F7K/',
      'Código QR del pase BB-4F7K'
    );
  });

  it('the QR points at whichever origin served the claim, a LAN address included (phone testing)', async () => {
    await post('atleta', 'ANA-7KQ', 'http://192.168.1.20:3001');
    expect(renderQrSvg).toHaveBeenCalledWith('http://192.168.1.20:3001/pase/verificar/BB-4F7K/', expect.any(String));
    // Measured: NextRequest rewrites a loopback host to localhost. Same
    // server on the Mac; recorded so nobody reads it as a bug later.
    await post('atleta', 'ANA-7KQ', 'http://127.0.0.1:3001');
    expect(renderQrSvg).toHaveBeenLastCalledWith('http://localhost:3001/pase/verificar/BB-4F7K/', expect.any(String));
  });

  it('T-AV27b: an attributed lead adds "Invitación de" and the door link to the partner email, and nothing else', async () => {
    await post('atleta', 'ANA-7KQ');
    const partner = vi.mocked(sendPartnerLeadNotification).mock.calls[0][0] as unknown as Record<string, unknown>;
    const guest = vi.mocked(sendLeadPassEmail).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(partner).sort()).toEqual([
      'cc',
      'choice1',
      'choice2',
      'code',
      'createdAt',
      'doorUrl',
      'email',
      'invitedBy',
      'name',
      'partnerName',
      'passCode',
      'src',
      'to',
      // T-GROW1 part B. Sent for EVERY lead, attributed or not, so it does not
      // weaken what this test is actually asserting: that ATTRIBUTION adds
      // exactly invitedBy and doorUrl and nothing else. Still an exact key-set
      // match rather than a relaxed one, because the exactness is the point --
      // route.flagoff.test.ts proves the same key set on an unattributed lead,
      // and the pair of them is what pins "adds exactly two".
      'utmCampaign',
      'whatsapp',
    ]);
    expect(partner.invitedBy).toBe('Ana');
    expect(partner.doorUrl).toBe('https://tribe-v3.vercel.app/pase/verificar/BB-4F7K/');
    expect(Object.keys(guest).sort()).toEqual([
      'address',
      'name',
      'partnerName',
      'passCode',
      'storefrontUrl',
      'to',
      'whatsappUrl',
    ]);
  });

  it('T-AV27b: an attributed lead tells the athlete (in-app), through 210, with the service role', async () => {
    vi.mocked(claimLeadNotification).mockResolvedValue({ success: true, data: [] });
    await post('atleta', 'ANA-7KQ');
    expect(claimLeadNotification).toHaveBeenCalledWith(expect.anything(), 'lead-1');
    expect(deliverNotifications).toHaveBeenCalledWith(expect.anything(), [], {
      actorId: null,
      origin: 'https://tribe-v3.vercel.app',
    });
  });

  it('T-AV27b: an unattributed lead keeps the partner email exactly as before and tells nobody', async () => {
    await post('print', 'BULLBOX-01');
    const partner = vi.mocked(sendPartnerLeadNotification).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(partner).not.toHaveProperty('invitedBy');
    expect(partner).not.toHaveProperty('doorUrl');
    expect(claimLeadNotification).not.toHaveBeenCalled();
  });

  it('no athlete link: the QR still shows (the program is on), nothing is attributed', async () => {
    const body = await (await post('print', 'BULLBOX-01')).json();
    expect(lead()).not.toHaveProperty('referred_by_athlete_id');
    expect(lead().consent_text).toBe(V1);
    expect(body.qr_svg).toBe('<svg>qr</svg>');
  });

  it('a code that does not resolve here (other gym, paused, ended): stored as plain code, no attribution', async () => {
    vi.mocked(findActiveAthleteByRefCode).mockResolvedValue(null);
    await post('atleta', 'ANA-7KQ');
    expect(lead()).not.toHaveProperty('referred_by_athlete_id');
    expect(lead().code).toBe('ANA-7KQ');
    expect(lead().consent_text).toBe(V1);
  });

  it('this partner has no active program: no QR, no attribution, and no athlete lookup', async () => {
    vi.mocked(fetchAthleteProgramStatus).mockResolvedValue({ isActive: false });
    const body = await (await post('atleta', 'ANA-7KQ')).json();
    expect(body).not.toHaveProperty('qr_svg');
    expect(lead()).not.toHaveProperty('referred_by_athlete_id');
    expect(findActiveAthleteByRefCode).not.toHaveBeenCalled();
  });

  it('the lookup throws: the lead is saved, 200, no attribution, and the failure is logged', async () => {
    vi.mocked(findActiveAthleteByRefCode).mockRejectedValue(new Error('program_athletes read failed'));
    const res = await post('atleta', 'ANA-7KQ');
    expect(res.status).toBe(200);
    expect(insertPassLead).toHaveBeenCalledTimes(1);
    expect(lead()).not.toHaveProperty('referred_by_athlete_id');
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'program_athletes read failed' }),
      expect.objectContaining({ action: 'resolveAthleteAttribution' })
    );
  });

  it('the attributed consent would exceed 500 characters: saved without attribution, logged', async () => {
    vi.mocked(fetchPassConfig).mockResolvedValue({ ...CONFIG, partnerName: 'G'.repeat(200) });
    const res = await post('atleta', 'ANA-7KQ');
    expect(res.status).toBe(200);
    expect(lead()).not.toHaveProperty('referred_by_athlete_id');
    expect(String(lead().consent_text).length).toBeLessThanOrEqual(500);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('exceeds 500') }),
      expect.objectContaining({ action: 'athlete_attribution' })
    );
  });

  it('the QR renderer throws: the claim still answers 200 without qr_svg, and it is logged', async () => {
    vi.mocked(renderQrSvg).mockImplementation(() => {
      throw new Error('qr broke');
    });
    const res = await post('atleta', 'ANA-7KQ');
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('qr_svg');
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'qr broke' }), {
      action: 'renderVoucherQr',
    });
  });
});
