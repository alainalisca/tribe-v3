import { describe, it, expect } from 'vitest';
import { whatsappHref, whatsappText } from './whatsapp';

describe('Enviar por WhatsApp (T-MOM1 Part C)', () => {
  it('greets the invite by first name, in ES and EN (approved text)', () => {
    const link = 'https://tribelatam.com/m/Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z/';
    const a = { name: 'Mateo Arango', session: 'Boxeo', coach: 'Salomón', link };
    expect(whatsappText('es', a)).toBe(`Hola Mateo, te tomamos fotos en Boxeo con Salomón. Míralas aquí: ${link}`);
    expect(whatsappText('en', { ...a, session: 'Boxing' })).toBe(
      `Hi Mateo, we took photos of you at Boxing with Salomón. See them here: ${link}`
    );
  });

  it('no name drops the greeting; no coach drops "con <coach>"', () => {
    const link = 'https://tribelatam.com/m/x/';
    expect(whatsappText('es', { name: '  ', session: 'Boxeo', coach: 'Salomón', link })).toBe(
      `Te tomamos fotos en Boxeo con Salomón. Míralas aquí: ${link}`
    );
    expect(whatsappText('en', { name: null, session: 'Boxing', coach: '', link })).toBe(
      `We took photos of you at Boxing. See them here: ${link}`
    );
  });

  it('opens wa.me on the E.164 digits with the text encoded', () => {
    expect(whatsappHref('+573001234567', 'Hola y adiós')).toBe('https://wa.me/573001234567?text=Hola%20y%20adi%C3%B3s');
    expect(whatsappHref('', 'x')).toBeNull();
  });
});
