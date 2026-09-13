/**
 * One derivation per partner-identity question, shared by every surface.
 *
 * Each of these existed three times before /g/[slug] would have made it four:
 * the feed banner card, the discovery tile and the gym storefront header each
 * carried their own copy of `monogram()`, and the gym/studio wording was an
 * inline ternary in each. The banner and the discovery tile had already drifted
 * once on the logo fallback chain (BullBox showed "CB" in the feed and its real
 * image everywhere else), which is what that class of duplication does.
 *
 * These are pure and i18n-key-returning rather than string-returning, so they
 * stay usable from a server component that has no `useTranslations` hook.
 */

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
export function partnerMonogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The `partner` namespace key for the type line ("Gimnasio" / "Estudio").
 *
 * NULL for anything else. An 'independent' partner is a person, and labelling
 * them a Gimnasio would be wrong -- the rule the feed card already applied and
 * the reason this returns a nullable key rather than defaulting to typeGym.
 */
export function partnerTypeLabelKey(businessType: string | null | undefined): 'typeGym' | 'typeStudio' | null {
  if (businessType === 'gym') return 'typeGym';
  if (businessType === 'studio') return 'typeStudio';
  return null;
}

/**
 * The `partner` namespace key for the "Ver gimnasio" / "Ver estudio" CTA.
 *
 * Unlike the type line this has no null case: every partner card needs a label
 * on its button, and gym is the general word. Studio is the only special case,
 * which is exactly what the banner did inline.
 */
export function partnerCtaLabelKey(businessType: string | null | undefined): 'viewGym' | 'viewStudio' {
  return businessType === 'studio' ? 'viewStudio' : 'viewGym';
}
