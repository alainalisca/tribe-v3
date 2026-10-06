/**
 * T-AV19 Part B.4. In log mode Resend is never constructed and never called.
 *
 * The spy is on the CONSTRUCTOR as well as on send: a log mode that built a
 * real client and simply did not call it would still hold an authenticated
 * client in memory, and "never called" would be a claim about luck.
 *
 * RESEND_API_KEY is set to a dummy in every case, so a log-mode pass cannot be
 * the old "safe because the key is missing" (recon F8) wearing a new name.
 *
 * Mutation proofs (run by hand, recorded in the T-AV19 report):
 *   - delete `if (emailMode() === 'log') return loggingClient(template);` in
 *     getResendClient -> "log mode never constructs Resend" goes red.
 *   - same line in getResendClientOrNull -> the OrNull case goes red.
 *   - the call-site case goes red if passLead.ts goes back to `new Resend(key)`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendMock, ctorMock, logMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: 'real_1' }, error: null, headers: null }),
  ctorMock: vi.fn(),
  logMock: vi.fn(),
}));

// A class, because the factory calls `new Resend(key)`; the constructor
// records its argument so "constructed" is observable, not inferred.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(key: string) {
      ctorMock(key);
    }
  },
}));

vi.mock('@/lib/logger', () => ({ log: logMock, logError: vi.fn() }));

import { getResendClient, getResendClientOrNull } from './resendClient';
import { sendPartnerLeadNotification } from './passLead';

const PROD = 'https://abcdefgh.supabase.co';
const ENV_KEYS = ['EMAIL_MODE', 'NEXT_PUBLIC_SUPABASE_URL', 'RESEND_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};

const PAYLOAD = { from: 'Tribe <t@example.com>', to: 'ana@example.com', subject: 'Hola', html: '<p>x</p>' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.RESEND_API_KEY = 'dummy-key-not-a-real-one';
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROD;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('log mode (EMAIL_MODE=log, dummy key present)', () => {
  beforeEach(() => {
    process.env.EMAIL_MODE = 'log';
  });

  it('log mode never constructs Resend and never calls send', async () => {
    const result = await getResendClient('test').emails.send(PAYLOAD);
    expect(ctorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    // The shape callers branch on: error null, data.id present.
    expect(result.error).toBeNull();
    expect(result.data?.id).toMatch(/^log-/);
  });

  it('writes one structured line with the recipient masked', async () => {
    await getResendClient('passLead').emails.send(PAYLOAD);
    expect(logMock).toHaveBeenCalledTimes(1);
    const line = logMock.mock.calls[0][1] as string;
    expect(line).toBe('[email:log] to=a***@example.com subject=Hola template=passLead');
    expect(line).not.toContain('ana@example.com');
  });

  it('the OrNull variant is a log client too, not null', async () => {
    const client = getResendClientOrNull('feedbackWidget');
    expect(client).not.toBeNull();
    await client!.emails.send(PAYLOAD);
    expect(ctorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('a real call site (passLead) goes through the factory and sends nothing', async () => {
    await sendPartnerLeadNotification({
      to: 'leo@bullbox.co',
      cc: [],
      partnerName: 'BullBox (Prueba)',
      name: 'Ana Ruiz',
      whatsapp: '+573001112233',
      email: 'ana@example.com',
      choice1: null,
      choice2: null,
      passCode: 'BU-4F7K',
      src: null,
      code: null,
      createdAt: new Date('2026-09-26T13:00:00Z'),
    });
    expect(ctorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.some((c) => String(c[1]).startsWith('[email:log]'))).toBe(true);
  });
});

describe('the localhost fail-safe', () => {
  it('a local Supabase URL keeps Resend unconstructed even with EMAIL_MODE=live', async () => {
    process.env.EMAIL_MODE = 'live';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    await getResendClient('test').emails.send(PAYLOAD);
    expect(ctorMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('live mode (unset, production URL)', () => {
  beforeEach(() => {
    delete process.env.EMAIL_MODE;
  });

  it('constructs Resend with the key and sends through it', async () => {
    const result = await getResendClient('test').emails.send(PAYLOAD);
    expect(ctorMock).toHaveBeenCalledWith('dummy-key-not-a-real-one');
    expect(sendMock).toHaveBeenCalledWith(PAYLOAD);
    expect(result.data?.id).toBe('real_1');
    expect(logMock).not.toHaveBeenCalled();
  });

  it('a real call site (passLead) reaches Resend', async () => {
    await sendPartnerLeadNotification({
      to: 'leo@bullbox.co',
      cc: [],
      partnerName: 'BullBox (Prueba)',
      name: 'Ana Ruiz',
      whatsapp: '+573001112233',
      email: 'ana@example.com',
      choice1: null,
      choice2: null,
      passCode: 'BU-4F7K',
      src: null,
      code: null,
      createdAt: new Date('2026-09-26T13:00:00Z'),
    });
    expect(ctorMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('with no key, throws exactly as every call site did before', () => {
    delete process.env.RESEND_API_KEY;
    expect(() => getResendClient('test')).toThrow('RESEND_API_KEY is not configured');
    expect(getResendClientOrNull('test')).toBeNull();
  });
});
