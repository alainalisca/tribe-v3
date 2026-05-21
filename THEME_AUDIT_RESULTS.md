# Theme Audit Results

Branch: `feature/social-features` · 6 commits · **50 files changed**
(+566 / -239). Light is now the default; dark mode retuned to WCAG.

## Summary

The single highest-leverage decision was to **retarget the spec's
intent onto the token systems the app already had** (the
`.bg-theme-*/.text-theme-*` utility layer + the shadcn HSL vars + the
canonical `tribe-*` Tailwind scale) rather than introduce the spec's
parallel `--tribe-*` token set. Two token-level changes — the
`globals.css` retune and the `tailwind.config.ts` charcoal-scale
retune — fixed dark-mode contrast across **hundreds of files at once**
with zero per-file risk. Per-file edits were only needed for files
that bypassed tokens with hardcoded hex/gray.

## What changed

| Phase            | Scope                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation       | Light default + `system` option + FOUC script; `.bg-theme-*/.text-theme-*` dark values retuned to WCAG; added `surface/elevated/inset/tertiary/muted/border-strong` slots; shadcn `.dark` aligned; Settings Light/Dark/System toggle; `scripts/check-theme-contrast.mjs` |
| Canonical retune | `tribe-surface/mid/card` hex → spec dark layering. Fixed ~175 files using `dark:bg-tribe-*` in one change. `tribe-green*` and dual-use `tribe-dark` deliberately untouched                                                                                               |
| Tier 1           | `session/[id]`, `create` migrated to semantic tokens                                                                                                                                                                                                                     |
| Tier 3 gray      | 36 app files: bare light `text-gray-400→text-theme-tertiary`, `text-gray-300→text-theme-secondary` (boundary-safe codemod)                                                                                                                                               |
| Tier 3 hex       | 15 app files: raw `bg-[#hex]`/borders → `bg-theme-*`/`border-theme`; page wrappers collapsed; light-text-on-now-light-bg regressions fixed                                                                                                                               |

## Files that needed no changes (already compatible)

Most of Tier 1 (own profile, public profile, communities) and the
bulk of the app had **zero** hardcoded offenders — they already used
`.bg-theme-*/.text-theme-*` or shadcn `bg-card/text-foreground`, so
the foundation + canonical retune corrected them automatically. This
is the payoff of retargeting existing tokens instead of a parallel
system.

## Especially problematic patterns

- **Dark-only token values, not the tokens themselves.** `text-gray-400`
  read as "unreadable" only because it sat on the muddy old
  backgrounds. After the bg retune it clears AA (4.95–6.24:1) — most
  of the feared "146-file gray sweep" evaporated.
- **`tribe-mid` triple-overloaded** (page bg / input / hover). Resolved
  to the spec page value `#1E2328`; hover now mirrors the existing
  light-mode darken-on-hover affordance (consistent, not a regression).
- **Spec internal contradictions.** Light `text-muted #9CA3AF` = 2.54:1
  on white and primary "14:1" is stricter than WCAG AAA itself.
  Readability won; deviations documented in `globals.css`.
- **Sweep-induced regression** (caught + fixed): making always-dark
  backgrounds theme-aware left `text-white`/`text-gray-200` invisible
  in light mode. All occurrences remapped to theme text tokens.

## Remaining / out of scope (manual review)

- **Marketing surface — 16 files intentionally excluded**
  (`components/marketing/**`, `app/about`, `app/faq`,
  `app/for-instructors`). It is a separate dark-by-design brand
  experience (`text-gray-400` on dark hero / `bg-white/[0.06]`); app
  theme tokens would invert it. Giving marketing a real light mode is
  a separate design effort, not a readability bug.
- **`text-gray-500` left as-is (~52 files).** Measures 4.83:1 on white
  — clears WCAG AA. Swept tokens stop at the genuine failures to keep
  the diff reviewable; revisit only if a stricter AAA bar is adopted.
- **Cross-repo:** sibling `tribe-os` Tailwind config still on old
  charcoal values — see `THEME_TOKEN_SYNC.md`.
- **Storefront redesign (spec Part 6 / Session 4)** not started —
  separate standalone rewrite, pending direction.
- Images, sport gradients, avatar colors, CTA green: untouched by
  design (spec Part 5C).

## Validation

`scripts/check-theme-contrast.mjs` — all 22 text/bg pairs pass in both
light and dark. `tsc --noEmit` clean. Production build green. Live
preview: the `feature/social-features` Vercel branch URL.
