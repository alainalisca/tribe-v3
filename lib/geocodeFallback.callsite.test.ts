import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * A failed reverse geocode must tell the user something.
 *
 * Both hooks below used to read:
 *
 *     const name = await reverseGeocodeGoogle(lat, lng);
 *     if (name) { setFormData(...) }
 *
 * with no else. So when the lookup failed, the spinner stopped, the location
 * field stayed empty, and nothing was said -- the button simply appeared dead.
 * That was invisible for as long as it lasted, because /api/geocode answered
 * 200 with display_name: null and the wrapper swallowed everything else.
 *
 * The route and the wrapper now log the reason. This guard covers the other
 * half: the USER is told, and can type the location instead.
 *
 * WHY A SOURCE GUARD. There is no test harness for either hook, and the defect
 * is not in what the hook computes -- it is in a branch that does not exist.
 * A behaviour test would need the whole geolocation and toast stack mocked to
 * assert the absence of a call. Reading the call site answers it directly, the
 * same reasoning as components/dashboard/StorefrontEditor.callsite.test.ts.
 */

const SITES = ['app/training-now/useTrainingNow.ts', 'components/trainingNow/useTrainingNowForm.ts'];

/** The `if (name) { ... }` that follows the reverseGeocodeGoogle call, plus
 *  whatever comes after it, so we can ask whether an else exists. */
function branchAfterGeocode(src: string): string {
  const i = src.indexOf('await reverseGeocodeGoogle(');
  if (i === -1) return '';
  return src.slice(i, i + 900);
}

describe('a failed reverse geocode is surfaced to the user', () => {
  it.each(SITES)('%s handles the null result with an else branch', (site) => {
    const seg = branchAfterGeocode(readFileSync(site, 'utf8'));
    expect(seg, `${site}: no reverseGeocodeGoogle call found`).not.toBe('');
    expect(seg, `${site}: the null result is still a silent no-op`).toMatch(/}\s*else\s*{/);
  });

  it.each(SITES)('%s notifies the user rather than failing quietly', (site) => {
    const seg = branchAfterGeocode(readFileSync(site, 'utf8'));
    const elseBody = seg.slice(seg.search(/}\s*else\s*{/));
    expect(elseBody, `${site}: the else branch calls no toast helper`).toMatch(/show(Info|Error|Success)\(/);
  });

  /** Both languages, because a message that exists only in English is a
   *  message half the users cannot read. */
  it.each(SITES)('%s says it in both languages', (site) => {
    const seg = branchAfterGeocode(readFileSync(site, 'utf8'));
    const elseBody = seg.slice(seg.search(/}\s*else\s*{/));
    expect(elseBody, `${site}: no language check in the message`).toContain("language === 'es'");
  });

  /** The coordinates are saved BEFORE the lookup, so only the name is missing.
   *  A message implying the position was lost would be wrong, and would push
   *  the user to re-tap a button that already worked. */
  it.each(SITES)('%s saves the coordinates before geocoding, so only the name is missing', (site) => {
    const src = readFileSync(site, 'utf8');
    const setCoords = src.indexOf('latitude, longitude }));');
    const geocode = src.indexOf('await reverseGeocodeGoogle(');
    expect(setCoords, `${site}: coordinates are not stored before the lookup`).toBeGreaterThan(-1);
    expect(setCoords).toBeLessThan(geocode);
  });
});
