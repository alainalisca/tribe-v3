/**
 * Policy v1.1 (approved by Al in chat, 2026-10-09; T-GROW spec progress log).
 *
 * content.ts says hand-editing the policy breaks the guarantee that nothing was
 * dropped, because nothing in the repository catches a dropped sentence. v1.1
 * was hand-applied, so this test is that catch: every approved sentence is
 * pinned VERBATIM, in the section it was approved for, in both languages.
 *
 * Literals here are the approved policy text. The owner of these strings is
 * app/legal/tratamiento-de-datos/content.ts, and changing either side means
 * the policy changed, which needs Al's approval and a version bump.
 */
import { describe, it, expect } from 'vitest';
import { DATA_POLICY, EFFECTIVE_DATE, type PolicyContent } from './content';

/** Every string in a section, paragraphs and bullet items alike. */
function sectionText(policy: PolicyContent, number: number): string[] {
  const section = policy.sections.find((s) => s.heading.startsWith(`${number}. `));
  if (!section) throw new Error(`section ${number} not found`);
  return section.blocks.flatMap((b) => (b.kind === 'p' ? [b.text] : b.items));
}

function allText(policy: PolicyContent): string {
  return [
    policy.title,
    ...policy.intro,
    ...policy.sections.flatMap((s) => [s.heading, ...sectionText(policy, parseInt(s.heading, 10))]),
  ].join('\n');
}

const APPROVED = {
  es: {
    s3: 'cómo llegaste a Tribe (el enlace, la campaña o el código de referido que usaste) y, si alguien te invitó, quién te invitó.',
    s4: 'Para operar nuestro programa de referidos: cuando te unes a través del enlace de invitación de otra persona, registramos esa conexión para darle el crédito a quien te invitó.',
    s5: 'analítica de producto (PostHog, Inc., Estados Unidos)',
  },
  en: {
    s3: 'how you arrived at Tribe (the link, campaign or referral code you used) and, if someone invited you, who invited you.',
    s4: "To run our referral program: when you join through someone's invitation link, we record that connection so we can credit the person who invited you.",
    s5: 'product analytics (PostHog, Inc., United States)',
  },
} as const;

describe.each(['es', 'en'] as const)('data policy v1.1 (%s)', (lang) => {
  const policy = DATA_POLICY[lang];

  it('section 3: the account-data bullet ends with the approved clause, joined by ";"', () => {
    const accountBullet = sectionText(policy, 3).find((t) =>
      t.startsWith(lang === 'es' ? 'Datos de cuenta:' : 'Account data:')
    );
    expect(accountBullet).toBeDefined();
    expect(accountBullet!.endsWith('; ' + APPROVED[lang].s3)).toBe(true);
  });

  it('section 4: the referral purpose is its own bullet, verbatim', () => {
    expect(sectionText(policy, 4)).toContain(APPROVED[lang].s4);
  });

  it('section 5: PostHog is named in the processors paragraph', () => {
    const processors = sectionText(policy, 5).find((t) => t.includes('Resend, Inc.'));
    expect(processors).toContain(APPROVED[lang].s5);
  });

  it('section 13 names tribelatam.com, and tribe-v3.vercel.app appears nowhere', () => {
    expect(sectionText(policy, 13).join(' ')).toContain('tribelatam.com/legal/tratamiento-de-datos');
    expect(allText(policy)).not.toContain('tribe-v3.vercel.app');
  });

  it('the version line says 1.1, and nothing says 1.0', () => {
    expect(policy.intro.some((l) => /^Versi[oó]n 1\.1 · /.test(l))).toBe(true);
    expect(allText(policy)).not.toMatch(/Versi[oó]n 1\.0/);
  });

  it('every other section is still present: 14 sections, numbered in order', () => {
    expect(policy.sections.map((s) => parseInt(s.heading, 10))).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });
});

/**
 * DELIBERATELY RED ON THE BRANCH. Al set the effective date to the day PR 1
 * merges, so it cannot be written in advance. This fails until it is, which is
 * what stops the policy shipping with "PENDIENTE" as its effective date. The
 * fix is to set EFFECTIVE_DATE in content.ts, never to edit this test.
 */
describe('data policy v1.1 effective date', () => {
  it('is set (not the merge-day placeholder) in both languages', () => {
    expect(EFFECTIVE_DATE.es).not.toMatch(/PENDIENTE/);
    expect(EFFECTIVE_DATE.en).not.toMatch(/PENDIENTE/);
    expect(EFFECTIVE_DATE.es).toMatch(/^\d{1,2} de [a-z]+ de 2026$/);
    expect(EFFECTIVE_DATE.en).toMatch(/^[A-Z][a-z]+ \d{1,2}, 2026$/);
  });
});
