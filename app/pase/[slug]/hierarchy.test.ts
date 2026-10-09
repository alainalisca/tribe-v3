import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * /pase is a BullBox conversion page reached from a printed voucher inside a
 * BullBox gym. The visitor arrives holding that gym's branding, and the page
 * led with the Tribe wordmark -- so the first thing on screen was the host,
 * not the brand they came for.
 *
 * Source assertions rather than a mounted render: the page is an async server
 * component that awaits getConfig, and what is being checked is document
 * ORDER and which CSS properties are used. A mounted test would need the whole
 * data path stubbed to assert something that is plainly readable in the file.
 */
const SRC = fs.readFileSync(path.join(process.cwd(), 'app/pase/[slug]/page.tsx'), 'utf8');

/** The active page's body, so the InactivePass copy of <Wordmark /> -- which
 *  legitimately still leads, being the only branding on that screen -- does
 *  not answer questions asked about the active one. */
const activePage = SRC.slice(SRC.indexOf('export default async function PasePage'));

describe('the partner leads, Tribe hosts', () => {
  it('NON-VACUITY: the active page body was actually found', () => {
    expect(activePage).toContain('<PartnerHero');
    expect(activePage).toContain('<PaseForm');
    expect(activePage.length).toBeGreaterThan(400);
  });

  it('the partner hero comes BEFORE the Tribe wordmark on the active page', () => {
    const hero = activePage.indexOf('<PartnerHero');
    const mark = activePage.indexOf('<Wordmark');
    expect(hero).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(-1);
    // Order, not presence. Both were present before this change too.
    expect(hero).toBeLessThan(mark);
  });

  it('the wordmark sits in the footer, after the form', () => {
    expect(activePage.indexOf('<PaseForm')).toBeLessThan(activePage.indexOf('<Wordmark'));
    expect(activePage).toMatch(/<footer[\s\S]*<Wordmark/);
  });

  it('the wordmark renders at its secondary size there', () => {
    expect(activePage).toContain('<Wordmark size="credit" />');
    // And the credit size is genuinely smaller and dimmer, not just a label.
    expect(SRC).toMatch(/credit \? 'h-5 w-auto opacity-70' : 'h-7 w-auto'/);
  });

  it('there is no header above the hero any more', () => {
    expect(activePage).not.toMatch(/<header[\s\S]*<Wordmark/);
  });
});

describe('the logo survives any shape it is given', () => {
  it('object-contain, never object-cover', () => {
    // Cropping a logo cuts the ends off the word, which is the part that has
    // to survive. Letterboxing is the lesser harm.
    expect(SRC).toContain('object-contain');
    expect(SRC).not.toContain('object-cover');
  });

  it('the image takes its own proportions, so distortion cannot happen', () => {
    // h-auto w-auto with max-height/max-width: the element is the image's
    // natural aspect, capped. Not a fixed box the image is stretched into.
    expect(SRC).toMatch(/className="block h-auto w-auto object-contain"/);
    expect(SRC).toMatch(/maxHeight: HERO_PX/);
  });

  it('a wide logo is capped, and still fits a 320px screen', () => {
    // 320px viewport - 32px padding = 288px of content. min(...,100%) is what
    // keeps a 4:1 wordmark inside that rather than overflowing the column.
    expect(SRC).toMatch(/maxWidth: `min\(\$\{HERO_PX \* HERO_MAX_ASPECT\}px, 100%\)`/);
  });

  it('the fallback initials tile derives from the same constant', () => {
    expect(SRC).toMatch(/style=\{\{ height: HERO_PX, width: HERO_PX \}\}/);
  });
});

describe('the white is deliberate, not accidental', () => {
  // T-GROW3b, 2026-10-08. THE PREMISE OF THIS ARM EXPIRED WITH THE PAGE.
  // It read: "BullBox's file is an opaque JPEG with white baked in. Without a
  // card it lands on the DARK page as a stray tile ending at an edge nobody
  // chose." That was true and the white card was the right answer to it. The
  // page is white now, so the tile has nothing to stand out against and the
  // card's own black drop shadow became the stray mark instead.
  //
  // What the arm was really protecting is the PADDING -- a mark pressed to the
  // edge of its container, on any ground -- so that is what it asserts now.
  it('an organization logo keeps its even padding', () => {
    expect(SRC).toMatch(/padding: HERO_CARD_PAD_PX/);
  });

  // And the thing that replaced it, asserted so the revert is visible: the
  // dark-page scaffolding must not come back under a white page, where it
  // renders as a smudge behind the logo.
  it('no dark-page scaffolding survives on the white page', () => {
    expect(SRC).not.toMatch(/shadow-black\//);
    expect(SRC).not.toMatch(/bg-tribe-dark px-4 py-8/);
  });

  it('the padding is one constant, like the size', () => {
    expect(SRC.match(/const HERO_CARD_PAD_PX = \d+;/g)).toHaveLength(1);
  });

  it('the padding is even on all four sides', () => {
    // A single `padding` value, not paddingTop/X/Y. A wide mark in a hugging
    // card would otherwise show more white on two sides than the other two.
    expect(SRC).not.toMatch(/padding(?:Top|Right|Bottom|Left|X|Y):/);
  });

  // The STRUCTURAL property, which is what this arm always meant and is
  // unchanged by the repaint: ONE isOrganizationPartner call decides the
  // treatment, so a gym and a person can never drift onto the same one. Only
  // the branches' contents changed -- an organization's mark now sits directly
  // on the page and a person's headshot keeps a filled, clipped circle,
  // because a headshot needs a boundary and a logo does not.
  it('a PERSON keeps the headshot treatment, decided by the same call', () => {
    expect(SRC).toMatch(/isOrganizationPartner\(config\)\s*\?[\s\S]{0,200}:\s*`inline-flex[^`]*overflow-hidden/);
    expect(SRC).toMatch(/:\s*`inline-flex[^`]*\$\{shape\} bg-stone-100`/);
  });

  it('the card still hugs the image, so the mark is not boxed', () => {
    // If the card gained a fixed height, a wordmark would sit in letterbox
    // bars again and the padding would stop being even.
    const hero = SRC.slice(SRC.indexOf('function PartnerHero'), SRC.indexOf('function Wordmark'));
    expect(hero).toContain('inline-flex');
    expect(hero).not.toMatch(/style=\{\{ height: HERO_PX, width: HERO_PX \}\}[\s\S]{0,200}config\.logoUrl/);
  });
});

describe('the hero size is one edit', () => {
  it('HERO_PX is declared once and is the only source of the size', () => {
    expect(SRC.match(/const HERO_PX = \d+;/g)).toHaveLength(1);
    expect(SRC).toContain('const HERO_PX = 128;');
  });

  it('no hardcoded pixel size competes with it in the hero', () => {
    const hero = SRC.slice(SRC.indexOf('function PartnerHero'), SRC.indexOf('function Wordmark'));
    // The old h-24 w-24 / width={96} height={96} are gone. If a raw size comes
    // back, raising HERO_PX stops being one edit and becomes a hunt.
    expect(hero).not.toMatch(/\bh-24\b|\bw-24\b/);
    expect(hero).not.toMatch(/width=\{\d+\}|height=\{\d+\}/);
  });

  it('every size in the hero derives from HERO_PX', () => {
    const hero = SRC.slice(SRC.indexOf('function PartnerHero'), SRC.indexOf('function Wordmark'));
    const sizeExprs = hero.match(/max(?:Height|Width): [^,\n]+/g) ?? [];
    expect(sizeExprs.length).toBeGreaterThan(0);
    for (const e of sizeExprs) expect(e).toContain('HERO_PX');
  });
});
