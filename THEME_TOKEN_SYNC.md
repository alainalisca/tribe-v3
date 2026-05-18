# Theme Token Sync — cross-repo tracking

**Status:** OPEN — sibling `tribe-os` codebase needs to sync the dark
charcoal scale.

## What changed (tribe-v3, May 2026, branch `feature/social-features`)

The dark-surface charcoal tokens in `tailwind.config.ts` were retuned
to the readability-driven theme spec. The old values had a ~10-12
brightness-point spread that made dark-mode layers indistinguishable
and sat too light for WCAG-compliant text contrast.

| Token                 | Old       | New       | Role                            |
| --------------------- | --------- | --------- | ------------------------------- |
| `tribe-surface`       | `#3D4349` | `#272D34` | dark surface (layer above page) |
| `tribe-surface-hover` | `#4A5056` | `#323941` | subtle lighten of surface       |
| `tribe-mid`           | `#52575D` | `#1E2328` | dark page / inset / hover       |
| `tribe-card`          | `#6B7178` | `#2E343B` | dark card (layer above surface) |

**Deliberately unchanged:**

- `tribe-green*` — brand identity, not a contrast problem.
- `tribe-dark` (`#272D34`) — dual-use ("primary text on light" / "page
  bg on dark"); already exactly the spec's dark surface, correct for
  both uses.

## Why this is a source-of-truth update, not a divergence

`tailwind.config.ts` documents these hex codes as the cross-repo source
of truth shared with the sibling `tribe-os` codebase. This change is a
**deliberate update** to that source of truth — the same class of
change as the May 2026 brand-green update (`#84cc16` → `#A8DA36`) — not
a silent drift. The theme spec is itself a design directive
("not cosmetic polish… a readability fix").

Tailwind hex values are not a build/API contract, so the sibling repo
will not break — its dark-mode grays simply differ until it syncs.

## Action for the sibling `tribe-os` repo

Apply the same four token value changes above to its
`tailwind.config.*` so the two apps stay visually aligned in dark mode.
No code changes required — value-only swap. Verify with a dark-mode
pass on its highest-traffic screens after syncing.

## Validation done here

- `scripts/check-theme-contrast.mjs`: all 22 text/bg pairs pass
  (light + dark).
- Common text classes (white, gray-100/200/300, and even the leftover
  `text-gray-400`) all clear WCAG AA on the new
  `tribe-surface/card/mid` backgrounds.
- Production build green.
