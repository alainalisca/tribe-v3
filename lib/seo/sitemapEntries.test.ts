import { describe, it, expect } from 'vitest';
import { bogotaToday, buildSitemapEntries, type SitemapInput } from './sitemapEntries';

const INPUT: SitemapInput = {
  siteUrl: 'https://tribelatam.com',
  partnerSlugs: ['bullbox'],
  instructorIds: ['11111111-1111-4111-8111-111111111111'],
  sessions: [{ id: '22222222-2222-4222-8222-222222222222', date: '2026-10-12' }],
  now: new Date('2026-10-09T20:00:00Z'),
};

const urls = (input: SitemapInput) => buildSitemapEntries(input).map((e) => e.url);

describe('buildSitemapEntries', () => {
  it('lists home, the static pages, partners, instructors and sessions on the canonical host', () => {
    expect(urls(INPUT)).toEqual([
      'https://tribelatam.com/',
      'https://tribelatam.com/for-instructors/',
      'https://tribelatam.com/about/',
      'https://tribelatam.com/faq/',
      'https://tribelatam.com/g/bullbox/',
      'https://tribelatam.com/i/11111111-1111-4111-8111-111111111111/',
      'https://tribelatam.com/s/22222222-2222-4222-8222-222222222222/',
    ]);
  });

  it('ends every URL with a slash (trailingSlash: true makes the bare form a 308)', () => {
    expect(urls(INPUT).every((u) => u.endsWith('/'))).toBe(true);
  });

  it('does not double the slash when the site URL already ends with one', () => {
    expect(urls({ ...INPUT, siteUrl: 'https://tribelatam.com/' })[0]).toBe('https://tribelatam.com/');
  });

  it('lists no /pase/ page: every pass page is noindex, and a sitemap must not list noindex URLs', () => {
    expect(urls(INPUT).some((u) => u.includes('/pase/'))).toBe(false);
  });

  it('still lists the static pages when every database section came back empty', () => {
    expect(urls({ ...INPUT, partnerSlugs: [], instructorIds: [], sessions: [] })).toHaveLength(4);
  });
});

describe('bogotaToday', () => {
  it('is the Medellín date, not the UTC one, in the five hours after UTC midnight', () => {
    expect(bogotaToday(new Date('2026-10-10T03:00:00Z'))).toBe('2026-10-09');
    expect(bogotaToday(new Date('2026-10-10T05:00:00Z'))).toBe('2026-10-10');
  });
});
