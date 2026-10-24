import { describe, it, expect } from 'vitest';
import { prefillPaymentInstructions } from './prefillPaymentInstructions';

describe('prefillPaymentInstructions', () => {
  it('fills an empty field with the previous instructions', () => {
    expect(prefillPaymentInstructions('', 'Nequi 300 123 4567')).toBe('Nequi 300 123 4567');
  });

  it('fills a whitespace-only field', () => {
    expect(prefillPaymentInstructions('  \n', 'https://bold.co/a')).toBe('https://bold.co/a');
  });

  it('never overwrites what the instructor typed', () => {
    expect(prefillPaymentInstructions('Efectivo en el lugar', 'Nequi 300 123 4567')).toBe('Efectivo en el lugar');
  });

  it('leaves the field alone when there is nothing to prefill', () => {
    expect(prefillPaymentInstructions('', null)).toBe('');
    expect(prefillPaymentInstructions('', '   ')).toBe('');
  });
});
