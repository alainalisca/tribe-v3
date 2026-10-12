import { describe, it, expect } from 'vitest';
import { linkifyPaymentText, firstPaymentLink } from './linkifyPaymentText';

describe('linkifyPaymentText', () => {
  it('returns plain text as a single text segment', () => {
    expect(linkifyPaymentText('Paga en efectivo al llegar')).toEqual([
      { type: 'text', value: 'Paga en efectivo al llegar' },
    ]);
  });

  it('returns no segments for an empty string', () => {
    expect(linkifyPaymentText('')).toEqual([]);
  });

  it('leaves a Nequi number as text', () => {
    expect(linkifyPaymentText('Nequi 300 123 4567')).toEqual([{ type: 'text', value: 'Nequi 300 123 4567' }]);
  });

  it('splits out one URL', () => {
    expect(linkifyPaymentText('Paga aquí https://checkout.bold.co/pago/abc gracias')).toEqual([
      { type: 'text', value: 'Paga aquí ' },
      { type: 'link', value: 'https://checkout.bold.co/pago/abc', href: 'https://checkout.bold.co/pago/abc' },
      { type: 'text', value: ' gracias' },
    ]);
  });

  it('splits out several URLs and keeps line breaks in the text', () => {
    const segments = linkifyPaymentText('Bold: https://bold.co/a\nWompi: http://wompi.co/b\nNequi 300 123 4567');
    expect(segments).toEqual([
      { type: 'text', value: 'Bold: ' },
      { type: 'link', value: 'https://bold.co/a', href: 'https://bold.co/a' },
      { type: 'text', value: '\nWompi: ' },
      { type: 'link', value: 'http://wompi.co/b', href: 'http://wompi.co/b' },
      { type: 'text', value: '\nNequi 300 123 4567' },
    ]);
  });

  it('trims trailing punctuation off a URL and keeps it as text', () => {
    expect(linkifyPaymentText('Link: https://mpago.la/xyz.')).toEqual([
      { type: 'text', value: 'Link: ' },
      { type: 'link', value: 'https://mpago.la/xyz', href: 'https://mpago.la/xyz' },
      { type: 'text', value: '.' },
    ]);
    expect(linkifyPaymentText('(https://mpago.la/xyz), gracias')).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', value: 'https://mpago.la/xyz', href: 'https://mpago.la/xyz' },
      { type: 'text', value: '), gracias' },
    ]);
  });

  it('keeps a balanced closing parenthesis that is part of the URL', () => {
    const [, link] = linkifyPaymentText('ver https://example.com/a_(b)');
    expect(link).toEqual({ type: 'link', value: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)' });
  });

  it('links a bare www. domain with an https:// href', () => {
    expect(linkifyPaymentText('www.bold.co/pago')).toEqual([
      { type: 'link', value: 'www.bold.co/pago', href: 'https://www.bold.co/pago' },
    ]);
  });

  it('rejects javascript:, data: and file: URLs as plain text', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd']) {
      expect(linkifyPaymentText(`Paga: ${bad}`)).toEqual([{ type: 'text', value: `Paga: ${bad}` }]);
    }
  });

  it('does not link a URL glued onto a word or an email', () => {
    expect(linkifyPaymentText('xhttps://evil.com')).toEqual([{ type: 'text', value: 'xhttps://evil.com' }]);
    expect(linkifyPaymentText('me@www.example.com')).toEqual([{ type: 'text', value: 'me@www.example.com' }]);
  });

  it('leaves a bare scheme with no host as text', () => {
    expect(linkifyPaymentText('https://')).toEqual([{ type: 'text', value: 'https://' }]);
  });
});

describe('firstPaymentLink', () => {
  it('returns the first valid link href', () => {
    expect(firstPaymentLink('Nequi 300 123 4567 o https://bold.co/a o https://wompi.co/b')).toBe('https://bold.co/a');
  });

  it('returns null when there is no valid link', () => {
    expect(firstPaymentLink('Nequi 300 123 4567')).toBeNull();
    expect(firstPaymentLink('javascript:alert(1)')).toBeNull();
  });
});
