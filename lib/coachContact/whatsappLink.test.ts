import { describe, it, expect } from 'vitest';
import { coachFirstName, whatsappPrefill, whatsappButtonLabel, whatsappHref } from './whatsappLink';

describe('whatsappLink', () => {
  it('uses the coach first name', () => {
    expect(coachFirstName('Salomón Restrepo')).toBe('Salomón');
    expect(coachFirstName('  Karen  ')).toBe('Karen');
    expect(coachFirstName(null)).toBe('');
  });

  it('prefills the origin line Al specified, in Spanish', () => {
    expect(whatsappPrefill('Salomón Restrepo', 'es')).toBe('Hola Salomón, te encontré en Tribe.');
  });

  it('prefills the English line for an English-language viewer', () => {
    expect(whatsappPrefill('Salomón Restrepo', 'en')).toBe('Hi Salomón, I found you on Tribe.');
  });

  it('still says where they found the coach when there is no name', () => {
    expect(whatsappPrefill('', 'es')).toBe('Hola, te encontré en Tribe.');
  });

  it('labels the button with the coach first name', () => {
    expect(whatsappButtonLabel('Salomón Restrepo', 'es')).toBe('Escríbele a Salomón por WhatsApp');
    expect(whatsappButtonLabel('Salomón Restrepo', 'en')).toBe('Message Salomón on WhatsApp');
  });

  it('builds a wa.me link with digits only and the encoded prefill', () => {
    const href = whatsappHref('+573001112233', 'Salomón', 'es');
    expect(href.startsWith('https://wa.me/573001112233?text=')).toBe(true);
    expect(decodeURIComponent(href.split('?text=')[1])).toBe('Hola Salomón, te encontré en Tribe.');
  });
});
