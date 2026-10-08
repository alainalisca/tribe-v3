/**
 * T-GROW1 part G, the link builder.
 *
 * THE ONE FAILURE THIS FILE EXISTS FOR: a poster that looks tracked and is not.
 *
 * Everything else here is cheap. The expensive mistake is a QR printed and stuck
 * to a wall in a gym carrying `?src=IG Reel`, which sanitizeTag drops to NULL on
 * arrival -- so every lead from that poster is untagged, nothing in the product
 * reports an error, and the first anyone knows is that a channel appears to have
 * sent nobody. By then the posters are printed.
 *
 * So the arms that matter are the ones proving the builder MINTS ONLY WHAT THE
 * CAPTURE PATH ACCEPTS, and that an unusable tag is visibly absent rather than
 * quietly mangled.
 */
import { describe, it, expect } from 'vitest';
import { buildTrackedLink, destinationPath, isLinkDestination, judgeCode } from './trackedLink';
import { sanitizeTag } from '@/lib/attribution';

const ORIGIN = 'https://tribe-v3.vercel.app';
const UUID = '0df617e9-7547-4a8d-a0b1-8be4d52a673a';

describe('destinationPath', () => {
  it('ends every path with a trailing slash', () => {
    // next.config sets trailingSlash: true, so a link without it answers 308 --
    // an extra round trip on gym wifi, and a redirect is where a query string can
    // be lost. The query string is the entire point of the link.
    expect(destinationPath('home')).toBe('/');
    expect(destinationPath('pase', 'bullbox')).toBe('/pase/bullbox/');
    expect(destinationPath('storefront', UUID)).toBe(`/storefront/${UUID}/`);
    expect(destinationPath('session', UUID)).toBe(`/session/${UUID}/`);
  });

  it('lowercases a pass slug, matching what /api/pase accepts', () => {
    // The route lowercases and then tests /^[a-z0-9-]{1,80}$/. A link carrying
    // BullBox would 404 or miss, so the builder cannot be looser than the route.
    expect(destinationPath('pase', 'BullBox')).toBe('/pase/bullbox/');
  });

  it('returns NULL rather than a wrong path when the target is missing', () => {
    // THE ARM THAT MATTERS MOST HERE. `/pase//` is a 404 on a poster, which is
    // bad; `/pase/` is the catalogue page, which is WORSE, because it works and
    // nobody notices until the leads do not arrive.
    expect(destinationPath('pase')).toBeNull();
    expect(destinationPath('pase', '')).toBeNull();
    expect(destinationPath('pase', '   ')).toBeNull();
    expect(destinationPath('storefront')).toBeNull();
    expect(destinationPath('session', 'not-a-uuid')).toBeNull();
  });

  it('refuses a slug the route would refuse', () => {
    for (const bad of ['has space', 'slash/es', 'under_score', 'a'.repeat(81)]) {
      expect(destinationPath('pase', bad), bad).toBeNull();
    }
  });

  it('validates a destination arriving over the wire', () => {
    for (const d of ['pase', 'storefront', 'session', 'home']) expect(isLinkDestination(d)).toBe(true);
    for (const bad of ['instructor', '', null, 1, 'PASE']) expect(isLinkDestination(bad)).toBe(false);
  });
});

describe('buildTrackedLink', () => {
  it('builds the shape already printed on material, plus utm_campaign', () => {
    const link = buildTrackedLink(ORIGIN, {
      destination: 'pase',
      target: 'bullbox',
      src: 'ig',
      code: 'IG-REEL-01',
      utmCampaign: 'hyrox-oct',
    });
    // Parameter order is FIXED: src, code, utm_campaign. Two links for the same
    // campaign have to be comparable by eye on a printed sheet, which is what
    // makes a typo visible.
    expect(link?.relative).toBe('/pase/bullbox/?src=ig&code=IG-REEL-01&utm_campaign=hyrox-oct');
    expect(link?.url).toBe(`${ORIGIN}/pase/bullbox/?src=ig&code=IG-REEL-01&utm_campaign=hyrox-oct`);
  });

  it('keeps the storefront shape the programme rules froze', () => {
    const link = buildTrackedLink(ORIGIN, { destination: 'storefront', target: UUID, src: 'pase', code: 'BULLBOX-01' });
    expect(link?.relative).toBe(`/storefront/${UUID}/?src=pase&code=BULLBOX-01`);
  });

  it('EVERY tag it mints survives the capture path unchanged', () => {
    // THE CENTRAL PROPERTY. This builder is the only place in the app that MINTS a
    // tag rather than reading one, so it is the only place that can guarantee the
    // poster carries something the capture library will accept. Checked by feeding
    // the built URL's own parameters back through sanitizeTag -- the real one, not
    // a restatement of its rules.
    const link = buildTrackedLink(ORIGIN, {
      destination: 'pase',
      target: 'bullbox',
      src: 'RunClub',
      code: 'runclub-sat0927',
      utmCampaign: 'Hyrox-Oct',
    });
    const params = new URLSearchParams(link!.relative.split('?')[1]);
    expect(sanitizeTag(params.get('src'), 'src')).toBe(params.get('src'));
    expect(sanitizeTag(params.get('code'), 'code')).toBe(params.get('code'));
    expect(sanitizeTag(params.get('utm_campaign'), 'utm_campaign')).toBe(params.get('utm_campaign'));
    // And it normalises, so the printed poster and the stored row agree.
    expect(params.get('src')).toBe('runclub');
    expect(params.get('code')).toBe('RUNCLUB-SAT0927');
  });

  it('OMITS an unusable tag rather than mangling it into the URL', () => {
    const link = buildTrackedLink(ORIGIN, {
      destination: 'pase',
      target: 'bullbox',
      src: 'ig reel',
      code: 'A'.repeat(41),
      utmCampaign: 'hyrox-oct',
    });
    // Absent is visible in the preview; truncated looks fine and is wrong. A
    // 41-character code silently printed as its first 40 characters would attribute
    // a poster to a campaign that does not exist.
    expect(link?.relative).toBe('/pase/bullbox/?utm_campaign=hyrox-oct');
    expect(link?.relative).not.toContain('src=');
    expect(link?.relative).not.toContain('code=');
  });

  it('omits the query entirely when there is nothing to track', () => {
    expect(buildTrackedLink(ORIGIN, { destination: 'home' })?.relative).toBe('/');
    // No bare '?' left dangling: a trailing question mark on a printed URL is the
    // kind of thing somebody retypes wrongly.
    expect(buildTrackedLink(ORIGIN, { destination: 'home' })?.url).toBe(`${ORIGIN}/`);
  });

  it('is null when the destination is incomplete, so no link is offered', () => {
    expect(buildTrackedLink(ORIGIN, { destination: 'pase', src: 'ig' })).toBeNull();
  });

  it('does not double the slash when the origin has one', () => {
    // Some CDNs treat '//pase/' as a different path from '/pase/'.
    expect(buildTrackedLink('https://tribe.fitness/', { destination: 'pase', target: 'bullbox' })?.url).toBe(
      'https://tribe.fitness/pase/bullbox/'
    );
  });
});

describe('judgeCode', () => {
  it('recognises every example from the convention', () => {
    for (const code of ['RUNCLUB-SAT0927', 'IG-REEL-01', 'EAFIT-TABLE-01', 'BULLBOX-01']) {
      expect(judgeCode(code), code).toEqual({ conventional: true, capturable: true });
    }
  });

  it('accepts a lowercase code as conventional, because the builder uppercases it', () => {
    // Judging the typed text case-sensitively would show a warning on a code the
    // builder is about to print correctly, which trains the user to ignore it.
    expect(judgeCode('runclub-sat0927').conventional).toBe(true);
  });

  it('calls an unconventional but usable code usable', () => {
    // ADVISORY, NOT ENFORCED. A builder that refused anything off-convention would
    // be wrong the first time Al needs a code nobody anticipated, and the
    // workaround is to hand-write the URL -- which loses the sanitising, the part
    // that actually matters.
    expect(judgeCode('OPENDAY')).toEqual({ conventional: false, capturable: true });
    expect(judgeCode('a_b')).toEqual({ conventional: false, capturable: true });
  });

  it('flags a code the capture path would DROP, which is the one that matters', () => {
    for (const code of ['IG REEL 01', 'café-01', 'A'.repeat(41), '', 'a/b']) {
      expect(judgeCode(code).capturable, code).toBe(false);
    }
  });
});
