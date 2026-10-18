import { describe, it, expect } from 'vitest';
import {
  coachLink,
  coachShareMessage,
  handleProblem,
  isTribeStorageUrl,
  isUserId,
  normalizeHandle,
  suggestHandle,
  whatsappShareHref,
} from './coachLink';

/** T-SHARE1 Part C: the coach's own link, tribelatam.com/i/<handle>. */
describe('handles', () => {
  it('fit lowercase letters, digits and _, 3 to 24, the same rule as users_handle_format (220)', () => {
    expect(handleProblem('andres')).toBeNull();
    expect(handleProblem('profe_wil_2')).toBeNull();
    expect(handleProblem('ab')).toBe('short');
    expect(handleProblem('a'.repeat(25))).toBe('long');
    expect(handleProblem('Andres')).toBe('chars');
    expect(handleProblem('andrés')).toBe('chars');
    expect(handleProblem('profe-wil')).toBe('chars');
    expect(handleProblem('profe wil')).toBe('chars');
    expect(normalizeHandle('  Andres_V ')).toBe('andres_v');
  });

  it('are suggested from the first name, accents and symbols dropped', () => {
    expect(suggestHandle('Andrés Varón Gómez')).toBe('andres');
    expect(suggestHandle('Salomón')).toBe('salomon');
    expect(suggestHandle('Al')).toBe('al_coach');
    expect(suggestHandle('Venom Programming')).toBe('venom');
    expect(suggestHandle('   ')).toBeNull();
    expect(suggestHandle(null)).toBeNull();
  });

  it('can never look like an account id, so /i/<x> knows which it is', () => {
    expect(isUserId('34d56f30-f8d2-4588-beaa-07ee53d13d1d')).toBe(true);
    expect(isUserId('andres')).toBe(false);
    expect(handleProblem('34d56f30-f8d2-4588-beaa-07ee53d13d1d')).not.toBeNull();
  });
});

describe('the link and its WhatsApp message', () => {
  it('uses the handle when there is one, the account id otherwise', () => {
    expect(coachLink({ id: 'u-1', handle: 'andres' })).toBe('https://tribelatam.com/i/andres');
    expect(coachLink({ id: 'u-1', handle: null })).toBe('https://tribelatam.com/i/u-1');
  });

  it('opens WhatsApp with the message, fully encoded, in the coach language', () => {
    const link = 'https://tribelatam.com/i/andres';
    const es = whatsappShareHref(link, 'es');
    expect(es.startsWith('https://wa.me/?text=')).toBe(true);
    const text = es.slice('https://wa.me/?text='.length);
    expect(text).not.toMatch(/[ :,áí]/);
    expect(decodeURIComponent(text)).toBe(coachShareMessage(link, 'es'));
    expect(decodeURIComponent(text)).toBe(
      'Esta es mi página en Tribe. Ahí están mis clases de la semana y puedes pedir cupo con tu nombre y WhatsApp: https://tribelatam.com/i/andres'
    );
    expect(decodeURIComponent(whatsappShareHref(link, 'en').split('text=')[1])).toMatch(
      /^This is my page on Tribe\..*\/i\/andres$/
    );
  });
});

describe('storage URLs', () => {
  const base = 'https://abc.supabase.co';
  it('accept only public objects in this project', () => {
    expect(isTribeStorageUrl(`${base}/storage/v1/object/public/profile-images/x.jpg`, base)).toBe(true);
    expect(isTribeStorageUrl('https://images.unsplash.com/photo-1.jpg', base)).toBe(false);
    expect(isTribeStorageUrl('https://www.marceanahata.com/a.webp', base)).toBe(false);
    expect(isTribeStorageUrl(`https://other.supabase.co/storage/v1/object/public/x.jpg`, base)).toBe(false);
    expect(isTribeStorageUrl(null, base)).toBe(false);
  });
});
