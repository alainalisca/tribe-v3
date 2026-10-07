/**
 * T-AV27b: an attributed lead's partner email adds "Invitación de {athlete}"
 * and "Confirmar en la puerta" with the door link (no QR image: most mail
 * clients block SVG and data URIs). Without those params the email is byte
 * for byte what it was, which is what hard line 8 needs with the flag off.
 * Mutation proof: always emit the lines -> "a plain lead's email is unchanged" RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  partnerName: 'BullBox (Prueba)',
  name: 'Laura Martinez',
  whatsapp: '+573001112233',
  email: 'laura@example.com',
  choice1: null,
  choice2: null,
  passCode: 'BU-4F7K',
  src: 'atleta',
  code: 'ANA-7KQ',
  createdAt: new Date('2026-10-01T12:00:00Z'),
};
const sent = () => sendMock.mock.calls[0][0] as { text: string; html: string };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  sendMock.mockResolvedValue({ data: { id: 'm' }, error: null });
});

describe('the partner email for an attributed lead', () => {
  it('adds "Invitación de Ana" and the door link, after the pass line', async () => {
    await sendPartnerLeadNotification({
      ...PARAMS,
      invitedBy: 'Ana',
      doorUrl: 'http://localhost:3101/pase/verificar/BU-4F7K/',
    });
    const { text, html } = sent();
    expect(text).toContain(
      'Pase: BU-4F7K\nInvitación de Ana\nConfirmar en la puerta: http://localhost:3101/pase/verificar/BU-4F7K/\n'
    );
    expect(html).toContain('<li>Invitación de Ana</li>');
    expect(html).toContain('<a href="http://localhost:3101/pase/verificar/BU-4F7K/">Confirmar en la puerta</a>');
    expect(html).not.toContain('<img');
  });

  it("a plain lead's email is unchanged: no invitation line, no door link", async () => {
    await sendPartnerLeadNotification(PARAMS);
    const { text, html } = sent();
    expect(text).not.toContain('Invitación');
    expect(text).not.toContain('Confirmar en la puerta');
    expect(text).toContain('Pase: BU-4F7K\nLlegó por: atleta · ANA-7KQ\n');
    expect(html).not.toContain('Invitación');
  });
});
