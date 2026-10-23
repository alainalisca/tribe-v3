/**
 * The page says what deleting an account does, and nothing it does not. It
 * used to promise a 30-day purge, a window to cancel, deletion "scheduled"
 * rather than done, and an automatic confirmation email; the code
 * (app/api/account/delete, softDeleteUser) does it all at once and sends no
 * email. Backlog item from the T-SITE1 spec; shipped with T-DEL1, so the page
 * describes what lib/account/deleteAccount and migration 228 actually do.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const lang = vi.hoisted(() => ({ current: 'es' as 'es' | 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: lang.current }) }));

import DeleteAccountPage from './page';

function textIn(language: 'es' | 'en') {
  lang.current = language;
  const { container, unmount } = render(<DeleteAccountPage />);
  const text = container.textContent ?? '';
  unmount();
  return text;
}

describe('/legal/delete-account', () => {
  it('Spanish: immediate, nothing about 30 days, scheduling or an English-only document', () => {
    const text = textIn('es');
    expect(text).toContain('esto ocurre de inmediato');
    expect(text).toContain('La eliminación es inmediata y no se puede deshacer');
    expect(text).toContain('¿Preguntas?');
    expect(text).not.toMatch(/30 días|programará|cancelar la solicitud|disponible en inglés/);
  });

  it('English: immediate, nothing about 30 days or scheduling', () => {
    const text = textIn('en');
    expect(text).toContain('this happens right away');
    expect(text).toContain('Deletion is immediate and cannot be undone');
    expect(text).not.toMatch(/30 days|30-day|scheduled|cancel the deletion/);
  });

  it('says what is kept, and that it is kept without a name', () => {
    expect(textIn('es')).toContain('sin tu nombre ni tus datos de contacto, bajo "Usuario eliminado"');
    expect(textIn('en')).toContain('without your name or contact details, under "Usuario eliminado"');
  });

  it('T-DEL1: names what the deletion now removes (private data, files, posts, tags) and keeps (reviews)', () => {
    const es = textIn('es');
    expect(es).toContain('datos bancarios, documento de identidad, contacto de emergencia y fecha de nacimiento');
    expect(es).toContain('fotos de sesiones, historias y Momentos');
    expect(es).toContain('tus etiquetas en fotos de otras personas');
    expect(es).toContain('Las reseñas que dejaste a entrenadores, con sus estrellas y su texto');
    const en = textIn('en');
    expect(en).toContain('bank details, ID document, emergency contact and date of birth');
    expect(en).toContain('The reviews you left for coaches, with their stars and text');
  });

  it('never claims a phone number is deleted: users has no phone column', () => {
    expect(textIn('es')).not.toMatch(/teléfono/);
    expect(textIn('en')).not.toMatch(/phone/);
  });
});
