import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Reply-To on the partner notification, pinned at both ends.
 *
 * WHY THIS HAS ITS OWN FILE. Reply-To is the difference between Leo hitting
 * reply and reaching the athlete, and Leo hitting reply and reaching a Tribe
 * inbox nobody is watching. It fails silently and invisibly: the email still
 * sends, still says "delivered", and nothing in the app or the logs is
 * different. The only place the mistake shows up is in someone's mail client,
 * days later, when a reply goes to the wrong person.
 *
 * TWO ASSERTIONS, BECAUSE THERE ARE TWO WAYS TO LOSE IT.
 *
 *   1. We stop passing the key. The SDK ignores unknown properties rather than
 *      throwing, so writing `reply_to` (the wire name, and the obvious guess)
 *      would compile under a loosened type and send with no Reply-To at all.
 *
 *   2. The SDK renames it under us. resend maps camelCase to snake_case itself
 *      in parseEmailToApiOptions, so `replyTo` is correct for the installed
 *      version and `reply_to` is not. A major version that flips this would
 *      break Reply-To with no type error and no test failure anywhere else.
 *
 * Verified against the live API on 2026-09-18 rather than assumed: message
 * 01a0b4c0-c965-7606-b624-69f58487b2b3 was delivered with
 * reply_to = ["alainalisca@gmail.com"], the lead's address.
 */

// vi.hoisted, because vi.mock is hoisted above ordinary declarations and a
// factory closing over a plain const would read it before it exists.
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null }),
}));

// A class, not an arrow: the module under test calls `new Resend(key)`.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendPartnerLeadNotification } from './passLead';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
});

const PARAMS = {
  to: 'leo@bullbox.co',
  cc: ['hola@tribe.co'],
  partnerName: 'CrossFit BullBox',
  name: 'Ana Ruiz',
  whatsapp: '+573001112233',
  email: 'ana@example.com',
  choice1: 'HYROX',
  choice2: 'Mañana',
  passCode: 'BB-4F7K',
  src: 'print',
  code: 'BULLBOX-01',
  createdAt: new Date('2026-09-18T13:42:08Z'),
};

describe('the partner notification carries Reply-To', () => {
  it('sends replyTo, spelled exactly as the installed SDK expects', async () => {
    await sendPartnerLeadNotification(PARAMS);

    const payload = sendMock.mock.calls[0][0];
    expect(Object.keys(payload)).toContain('replyTo');
    // The wire name is what the SDK produces, never what we hand it. Passing
    // this spelling would be silently dropped.
    expect(Object.keys(payload)).not.toContain('reply_to');
  });

  it('points it at the lead, not at Tribe', async () => {
    await sendPartnerLeadNotification(PARAMS);

    const payload = sendMock.mock.calls[0][0];
    expect(payload.replyTo).toBe('ana@example.com');
    // The whole point: replying must not reach the From address.
    expect(payload.replyTo).not.toBe(payload.from);
    expect(payload.from).toContain('tribe@aplusfitnessllc.com');
  });

  it('goes to the partner inbox with the cc list', async () => {
    await sendPartnerLeadNotification(PARAMS);

    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('leo@bullbox.co');
    expect(payload.cc).toEqual(['hola@tribe.co']);
  });

  it('omits cc rather than sending an empty array', async () => {
    await sendPartnerLeadNotification({ ...PARAMS, cc: [] });
    expect(sendMock.mock.calls[0][0].cc).toBeUndefined();
  });
});

/**
 * The SDK half of the contract. Reads the installed package rather than
 * trusting the version in package.json, so an upgrade that renames the field
 * fails here instead of quietly sending every partner notification without a
 * Reply-To.
 */
describe('the installed resend SDK maps replyTo onto the wire field', () => {
  it('translates replyTo to reply_to itself', () => {
    const dist = path.join(process.cwd(), 'node_modules', 'resend', 'dist', 'index.mjs');
    const source = fs.readFileSync(dist, 'utf-8');
    expect(source).toContain('reply_to: email.replyTo');
  });
});
