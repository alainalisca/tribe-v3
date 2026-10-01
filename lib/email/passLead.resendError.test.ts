import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-AV27b. A partner lead email that Resend REFUSES must reject, so /api/pase
 * does not stamp notified_at on a lead nobody was told about.
 *
 * The Resend SDK reports a refused send in its return value,
 * `{ data: null, error: {...} }`, and does not throw. sendPartnerLeadNotification
 * awaited the call without reading `error`, so a refused send resolved, the
 * route's Promise.allSettled saw "fulfilled", and markPassLeadNotified ran.
 * notified_at NULL is the flag that a lead must be chased by hand; stamping it
 * on a failure hides exactly the lead that needs chasing.
 *
 * Asserts the outcome the caller branches on (rejected or fulfilled), not that
 * send() was called (CLAUDE.md: asserting the attempt is not asserting the
 * result). Proven by removing the check: the first case goes green-to-red.
 */
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendPartnerLeadNotification } from './passLead';

const PARAMS = {
  to: 'leo@bullbox.co',
  cc: [],
  partnerName: 'CrossFit BullBox',
  name: 'Ana Ruiz',
  whatsapp: '+573001112233',
  email: 'ana@example.com',
  choice1: null,
  choice2: null,
  passCode: 'BB-4F7K',
  src: null,
  code: null,
  createdAt: new Date('2026-10-01T12:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
});

describe('sendPartnerLeadNotification and a refused send', () => {
  it('rejects when Resend returns an error, and the reason carries no personal data', async () => {
    sendMock.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field' } });
    const result = await Promise.allSettled([sendPartnerLeadNotification(PARAMS)]);
    expect(result[0].status).toBe('rejected');
    const reason = String((result[0] as PromiseRejectedResult).reason);
    expect(reason).toContain('validation_error');
    expect(reason).not.toContain('leo@bullbox.co');
    expect(reason).not.toContain('ana@example.com');
  });

  it('resolves when Resend accepts the send', async () => {
    sendMock.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const result = await Promise.allSettled([sendPartnerLeadNotification(PARAMS)]);
    expect(result[0].status).toBe('fulfilled');
  });
});
