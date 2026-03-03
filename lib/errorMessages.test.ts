import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errorMessages';

describe('getErrorMessage', () => {
  it('returns English message for known error code', () => {
    const error = { code: '23505' };
    const result = getErrorMessage(error, 'join_session', 'en');
    expect(result).toBe('You have already joined this session.');
  });

  it('returns Spanish message for known error code', () => {
    const error = { code: '23505' };
    const result = getErrorMessage(error, 'join_session', 'es');
    expect(result).toBe('Ya te has unido a esta sesión.');
  });

  it('returns context-specific fallback for unknown error code', () => {
    const error = { code: 'SOME_UNKNOWN_CODE' };
    const result = getErrorMessage(error, 'join_session', 'en');
    expect(result).toBe('Could not join session. Please try again.');
  });

  it('returns context-specific Spanish fallback for unknown error code', () => {
    const error = { code: 'SOME_UNKNOWN_CODE' };
    const result = getErrorMessage(error, 'create_session', 'es');
    expect(result).toBe('No se pudo crear la sesión. Verifica los detalles.');
  });

  it('returns generic fallback for unknown context', () => {
    const error = { code: 'SOME_UNKNOWN_CODE' };
    const result = getErrorMessage(error, 'unknown_context', 'en');
    expect(result).toBe('Something went wrong. Please try again.');
  });

  it('returns generic Spanish fallback for unknown context', () => {
    const error = { code: 'SOME_UNKNOWN_CODE' };
    const result = getErrorMessage(error, 'unknown_context', 'es');
    expect(result).toBe('Algo salió mal. Por favor inténtalo de nuevo.');
  });

  it('handles null error gracefully', () => {
    const result = getErrorMessage(null, 'join_session', 'en');
    expect(result).toBe('Could not join session. Please try again.');
  });

  it('handles undefined error gracefully', () => {
    const result = getErrorMessage(undefined, 'join_session', 'en');
    expect(result).toBe('Could not join session. Please try again.');
  });

  it('matches error by message when code is absent', () => {
    const error = { message: 'NETWORK_ERROR: connection refused' };
    const result = getErrorMessage(error, 'join_session', 'en');
    expect(result).toBe('Connection lost. Please check your internet.');
  });

  it('defaults to English when language not provided', () => {
    const error = { code: 'TIMEOUT' };
    const result = getErrorMessage(error, 'join_session');
    expect(result).toBe('Request timed out. Please try again.');
  });

  // --- Extended: Auth contexts ---

  it('login context returns EN fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'login', 'en');
    expect(result).toBe('Incorrect email or password. Please try again.');
  });

  it('login context returns ES fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'login', 'es');
    expect(result).toBe('Correo o contraseña incorrectos. Inténtalo de nuevo.');
  });

  it('signup context returns EN fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'signup', 'en');
    expect(result).toBe('Could not create account. Please try again.');
  });

  it('signup context returns ES fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'signup', 'es');
    expect(result).toBe('No se pudo crear la cuenta. Inténtalo de nuevo.');
  });

  it('forgot_password context returns EN fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'forgot_password', 'en');
    expect(result).toBe('Could not send reset email. Please try again.');
  });

  it('forgot_password context returns ES fallback', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'forgot_password', 'es');
    expect(result).toBe('No se pudo enviar el correo de restablecimiento. Inténtalo de nuevo.');
  });

  it('weak_password context returns EN message', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'weak_password', 'en');
    expect(result).toBe('Password must be at least 6 characters.');
  });

  it('weak_password context returns ES message', () => {
    const result = getErrorMessage({ code: 'UNKNOWN' }, 'weak_password', 'es');
    expect(result).toBe('La contraseña debe tener al menos 6 caracteres.');
  });

  // --- Extended: Supabase error string mapping ---

  it('maps "Invalid login credentials" error string', () => {
    const error = { message: 'Invalid login credentials' };
    const result = getErrorMessage(error, 'login', 'en');
    expect(result).toBe('Incorrect email or password. Please try again.');
  });

  it('maps "User already registered" error string', () => {
    const error = { message: 'User already registered' };
    const result = getErrorMessage(error, 'signup', 'en');
    expect(result).toBe('An account with this email already exists.');
  });

  it('maps "Email not confirmed" error string', () => {
    const error = { message: 'Email not confirmed' };
    const result = getErrorMessage(error, 'login', 'es');
    expect(result).toBe('Por favor verifica tu correo antes de iniciar sesión.');
  });

  it('maps "Password should be at least" error string', () => {
    const error = { message: 'Password should be at least 6 characters' };
    const result = getErrorMessage(error, 'signup', 'en');
    expect(result).toBe('Password must be at least 6 characters.');
  });

  // --- Extended: All contexts have both EN and ES ---

  it('all contexts return non-empty strings for EN and ES', () => {
    const contexts = [
      'join_session',
      'create_session',
      'upload_photo',
      'update_profile',
      'delete_session',
      'send_message',
      'update_session',
      'submit_feedback',
      'submit_review',
      'accept_invite',
      'handle_request',
      'update_settings',
      'admin_action',
      'accept_waiver',
      'google_sign_in',
      'apple_sign_in',
      'login',
      'signup',
      'email_taken',
      'email_auth',
      'forgot_password',
      'reset_password',
      'weak_password',
    ];

    for (const ctx of contexts) {
      const en = getErrorMessage({ code: 'UNKNOWN' }, ctx, 'en');
      const es = getErrorMessage({ code: 'UNKNOWN' }, ctx, 'es');
      expect(en).toBeTruthy();
      expect(es).toBeTruthy();
      expect(en).not.toBe(es); // EN and ES should be different
    }
  });
});
