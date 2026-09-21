import { describe, it, expect } from 'vitest';
import { isOrganizationPartner } from './passLeads';
import { ORGANIZATION_TYPES } from './gymVenue';

/**
 * The pass page's avatar shape (T-GYM1, closed for /pase by T-LEAD2).
 *
 * #169 drew a rounded square for every partner because business_type was not in
 * the select that builds PassConfig. These assert the decision, not the CSS:
 * the class name lives in app/pase/[slug]/page.tsx and a test that pinned it
 * would be asserting the spelling of a Tailwind token rather than whether a
 * person gets a circle.
 */
describe('isOrganizationPartner', () => {
  it('calls a gym and a studio organizations', () => {
    expect(isOrganizationPartner({ businessType: 'gym' })).toBe(true);
    expect(isOrganizationPartner({ businessType: 'studio' })).toBe(true);
  });

  /**
   * The case the fix exists for. BullBox is a gym, so nothing visible changes
   * on production today; this is the row shape that first shows a circle.
   */
  it('calls an independent trainer a person', () => {
    expect(isOrganizationPartner({ businessType: 'independent' })).toBe(false);
  });

  /**
   * business_type is nullable with a default of 'studio', so a null can only
   * arrive from an explicit write. A person is the safer default: drawing a
   * square around a face is more wrong than drawing a circle around a logo.
   */
  it('treats an absent business_type as a person', () => {
    expect(isOrganizationPartner({ businessType: null })).toBe(false);
  });

  /**
   * THE KNOWN GAP, ASSERTED RATHER THAN LEFT TO BE DISCOVERED.
   *
   * featured_partners_business_type_check permits 'academy' and 'club';
   * ORGANIZATION_TYPES lists only gym and studio. So both fall to the circle
   * here -- and to the person treatment on /instructors and on the storefront,
   * because every one of those surfaces reads the same constant.
   *
   * This is recorded, not endorsed. It is wrong in one place if it is wrong,
   * which is the whole reason the list is imported rather than redeclared. When
   * a real academy or club signs up, fix ORGANIZATION_TYPES and this test goes
   * red in the one file that decides.
   */
  it('inherits the academy/club gap from ORGANIZATION_TYPES rather than inventing its own answer', () => {
    expect(ORGANIZATION_TYPES).not.toContain('academy');
    expect(ORGANIZATION_TYPES).not.toContain('club');
    expect(isOrganizationPartner({ businessType: 'academy' })).toBe(false);
    expect(isOrganizationPartner({ businessType: 'club' })).toBe(false);
  });

  /**
   * Closes the cheap way to satisfy the tests above: hardcoding 'gym' and
   * 'studio' here instead of reading the shared constant. Every member of
   * ORGANIZATION_TYPES must be an organization, whatever that list grows to.
   */
  it('agrees with ORGANIZATION_TYPES on every member, so a fifth type cannot drift', () => {
    for (const type of ORGANIZATION_TYPES) {
      expect(isOrganizationPartner({ businessType: type })).toBe(true);
    }
  });
});
