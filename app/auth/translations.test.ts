import { describe, it, expect } from 'vitest';
import { getAuthTranslations } from './translations';

describe('getAuthTranslations — verify code copy', () => {
  it('provides bilingual verify-code strings', () => {
    const es = getAuthTranslations('es');
    const en = getAuthTranslations('en');
    expect(es.verifyTitle).toBe('Verifica tu cuenta');
    expect(en.verifyTitle).toBe('Verify your account');
    expect(es.verifyInstructions('a@b.com')).toContain('a@b.com');
    expect(en.codePlaceholder).toBe('123456');
  });
});
