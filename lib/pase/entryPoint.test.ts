import { describe, it, expect } from 'vitest';
import { PASS_ENTRY_CODES, hasClaimablePass, passEntryUrl } from './entryPoint';

/**
 * Migration 173's pass_leads_code_shape CHECK, verbatim.
 *
 * Pinned here rather than described, because the failure it guards is silent:
 * a code the CHECK rejects does not fail the claim, it is dropped to NULL by
 * sanitizeTag in app/api/pase/route.ts, and the lead arrives with no
 * attribution. Nobody would notice until a number in the admin view was wrong.
 */
const DB_CODE_CHECK = /^[A-Za-z0-9_-]{1,40}$/;

describe('PASS_ENTRY_CODES', () => {
  it('produces codes the database will actually store', () => {
    for (const code of Object.values(PASS_ENTRY_CODES)) {
      expect(DB_CODE_CHECK.test(code)).toBe(true);
    }
  });

  /**
   * The two surfaces exist to be told apart. If they ever shared a value the
   * product would look identical and the attribution would be useless, which is
   * exactly the class of defect that survives to production.
   */
  it('gives the two surfaces distinct codes', () => {
    expect(PASS_ENTRY_CODES.storefront).not.toBe(PASS_ENTRY_CODES.card);
  });
});

describe('hasClaimablePass', () => {
  it('shows the entry point only when pass_active is true', () => {
    expect(hasClaimablePass({ slug: 'bullbox', pass_active: true })).toBe(true);
    expect(hasClaimablePass({ slug: 'bullbox', pass_active: false })).toBe(false);
  });

  /**
   * pass_active is NOT NULL in the database, but the column arrives here
   * through a PostgREST select typed as boolean | null, and a partner row read
   * before the column was added would be undefined. Neither is `true`, and
   * neither may open a lead form on a partner who has not asked for one.
   */
  it('treats a missing or null pass_active as no pass, never as yes', () => {
    expect(hasClaimablePass({ slug: 'bullbox', pass_active: null })).toBe(false);
    expect(hasClaimablePass({ slug: 'bullbox', pass_active: undefined })).toBe(false);
    expect(hasClaimablePass(null)).toBe(false);
    expect(hasClaimablePass(undefined)).toBe(false);
  });

  /**
   * The slug arm is a type narrowing for passEntryUrl, not a business rule:
   * featured_partners.slug is NOT NULL with a trigger filling it, so this
   * combination does not occur on production. It is asserted because the
   * alternative to hiding is building /pase/null/, which is a 404-shaped page
   * on a partner who has a working pass.
   */
  it('refuses to render an entry point it could not build a URL for', () => {
    expect(hasClaimablePass({ slug: null, pass_active: true })).toBe(false);
    expect(hasClaimablePass({ slug: '', pass_active: true })).toBe(false);
  });
});

describe('passEntryUrl', () => {
  it('keeps the trailing slash ahead of the query string', () => {
    const url = passEntryUrl('bullbox', PASS_ENTRY_CODES.storefront);
    // The slash is what avoids a 308 under trailingSlash: true. Asserted on the
    // boundary itself rather than on the whole string, so the intent survives a
    // future change to the parameters.
    expect(url).toContain('/pase/bullbox/?');
    expect(url).not.toContain('/pase/bullbox?');
  });

  it('stamps src=app and the calling surface on each entry point', () => {
    expect(passEntryUrl('bullbox', PASS_ENTRY_CODES.storefront)).toBe('/pase/bullbox/?src=app&code=APP-STOREFRONT');
    expect(passEntryUrl('bullbox', PASS_ENTRY_CODES.card)).toBe('/pase/bullbox/?src=app&code=APP-CARD');
  });

  /**
   * A slug is constrained to ^[a-z0-9-]+$ by featured_partners_slug_check, so
   * there is nothing to escape today. Encoding it anyway costs nothing and
   * means a future relaxation of that CHECK cannot turn a slug into a second
   * query parameter.
   */
  it('encodes the slug rather than trusting the column CHECK to hold forever', () => {
    expect(passEntryUrl('a&b', PASS_ENTRY_CODES.card)).toBe('/pase/a%26b/?src=app&code=APP-CARD');
  });
});
