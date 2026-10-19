/**
 * Policy v1.1 (approved by Al in chat, 2026-10-09; T-GROW spec progress log),
 * and v1.2 (approved by Al in chat, 2026-10-11): the contact channel is
 * info@tribelatam.com, the address Tribe's email is sent from. v1.3 (approved
 * by Al in chat, 2026-10-19, T-MOM1): the "Fotos y videos" paragraph in
 * section 5.
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
    s5photos: 'Fotos y videos: los coaches, su equipo, Tribe y los miembros pueden publicar fotos y videos cortos de las sesiones. Las fotos en las que apareces te llegan en privado y puedes quitarte de cualquier foto en cualquier momento. Una foto o video tuyo aparece en la página de un coach, en una publicación pública o fuera de Tribe solo si tú lo decides. Las publicaciones solo las ven los miembros con sesión iniciada, y cualquiera puede reportar una publicación.',
  },
  en: {
    s3: 'how you arrived at Tribe (the link, campaign or referral code you used) and, if someone invited you, who invited you.',
    s4: "To run our referral program: when you join through someone's invitation link, we record that connection so we can credit the person who invited you.",
    s5: 'product analytics (PostHog, Inc., United States)',
    s5photos: "Photos and videos: coaches, their crew, Tribe and members may post photos and short videos from sessions. Photos of you are delivered to you privately, and you can remove yourself from any photo at any time. A photo or video of you appears on a coach's page, in a public post or outside Tribe only if you choose. Posts are visible only to signed-in members, and anyone can report a post.",
  },
} as const;

describe.each(['es', 'en'] as const)('data policy v1.3 (%s)', (lang) => {
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

  it('the version line says 1.3, and nothing says 1.0, 1.1 or 1.2', () => {
    expect(policy.intro.some((l) => /^Versi[oó]n 1\.3 · /.test(l))).toBe(true);
    expect(allText(policy)).not.toMatch(/Versi[oó]n 1\.[012]\b/);
  });

  it('v1.3: section 5 carries the photos and videos paragraph verbatim, before Authorities', () => {
    const s5 = sectionText(policy, 5);
    const at = s5.indexOf(APPROVED[lang].s5photos);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(s5[at + 1].startsWith(lang === 'es' ? 'Autoridades.' : 'Authorities.')).toBe(true);
  });

  it('v1.2: the contact channel is info@tribelatam.com in sections 1, 8 and 14, and the old address appears nowhere', () => {
    for (const n of [1, 8, 14]) {
      expect(sectionText(policy, n).join(' '), `section ${n}`).toContain('info@tribelatam.com');
    }
    expect(allText(policy).match(/info@tribelatam\.com/g)).toHaveLength(3);
    expect(allText(policy)).not.toContain('aplusfitnessllc');
  });

  it('v1.2: A Plus Fitness LLC is still the controller (only the address changed)', () => {
    expect(sectionText(policy, 1).join(' ')).toContain('A Plus Fitness LLC');
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
describe('data policy effective date', () => {
  it('is set (not the merge-day placeholder) in both languages', () => {
    expect(EFFECTIVE_DATE.es).not.toMatch(/PENDIENTE/);
    expect(EFFECTIVE_DATE.en).not.toMatch(/PENDIENTE/);
    expect(EFFECTIVE_DATE.es).toMatch(/^\d{1,2} de [a-z]+ de 2026$/);
    expect(EFFECTIVE_DATE.en).toMatch(/^[A-Z][a-z]+ \d{1,2}, 2026$/);
  });
});
