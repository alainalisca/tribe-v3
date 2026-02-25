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
});
