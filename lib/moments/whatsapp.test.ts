import { describe, it, expect } from 'vitest';
import { whatsappHref, whatsappText } from './whatsapp';

describe('Enviar por WhatsApp (T-MOM1 Part C)', () => {
  it('the ES and EN messages, with and without a coach', () => {
    const link = 'https://tribelatam.com/m/Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z/';
    expect(whatsappText('es', 'Boxeo', 'Salomon', link)).toBe(
      `Te tomamos fotos en Boxeo con Salomon. Están aquí: ${link}`
    );
    expect(whatsappText('en', 'Boxing', 'Salomon', link)).toBe(
      `We took photos of you at Boxing with Salomon. They're here: ${link}`
    );
    expect(whatsappText('es', 'Boxeo', '', link)).toBe(`Te tomamos fotos en Boxeo. Están aquí: ${link}`);
  });

  it('opens wa.me on the E.164 digits with the text encoded', () => {
    expect(whatsappHref('+573001234567', 'Hola y adiós')).toBe('https://wa.me/573001234567?text=Hola%20y%20adi%C3%B3s');
    expect(whatsappHref('', 'x')).toBeNull();
  });
});
