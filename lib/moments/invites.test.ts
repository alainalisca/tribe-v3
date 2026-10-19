import { describe, it, expect } from 'vitest';
import { checkInvite, newInviteToken } from './invites';

describe('invites (T-MOM1)', () => {
  it('tokens are 32 letters and digits, and differ', () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(newInviteToken()).not.toBe(a);
  });

  it('a name is required; the WhatsApp is optional and validated like the guest modal', () => {
    expect(checkInvite({ name: '  ' })).toEqual({ ok: false, error: 'name_required' });
    expect(checkInvite({ name: 'x'.repeat(81) })).toEqual({ ok: false, error: 'name_too_long' });
    expect(checkInvite({ name: ' Daniela  Ríos ' })).toEqual({ ok: true, name: 'Daniela Ríos', phone: null });
    expect(checkInvite({ name: 'Daniela', phone: '300 123 4567' })).toEqual({
      ok: true,
      name: 'Daniela',
      phone: '+573001234567',
    });
    expect(checkInvite({ name: 'Daniela', phone: '604 444 5555' })).toEqual({ ok: false, error: 'invalid_phone' });
    expect(checkInvite({ name: 'Daniela', phone: 'abc' })).toEqual({ ok: false, error: 'invalid_phone' });
  });
});
