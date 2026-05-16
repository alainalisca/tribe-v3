# Mobile real-device verification

Pre-beta gate from Week 4 Mission 3. Walk every premium-tier surface
on real iOS and real Android, capture screenshots for anything that
looks off, label per severity, fix CRITICAL before any beta candidate
is onboarded.

## How to fill this in

For each surface, one row per device variant: iOS Capacitor app,
Android Capacitor app, Safari standalone (iOS), Chrome standalone
(Android). Mark each cell:

- **PASS** — surface renders and works
- **COSMETIC** — looks rough but functions; defer to Week 5
- **MAJOR** — workflow broken or significantly degraded; fix this
  week
- **CRITICAL** — blocks beta; fix today before continuing

Verification run date: **YYYY-MM-DD** (Al fills in before starting)

## Premium-tier surfaces

| Surface                                                                   | iOS Capacitor | Android Capacitor | iOS Safari | Android Chrome | Notes |
| ------------------------------------------------------------------------- | ------------- | ----------------- | ---------- | -------------- | ----- |
| `/os/dashboard`                                                           |               |                   |            |                |       |
| `/os/clients` empty state                                                 |               |                   |            |                |       |
| `/os/clients/new` form                                                    |               |                   |            |                |       |
| `/os/clients` populated list                                              |               |                   |            |                |       |
| `/os/clients/[id]` detail                                                 |               |                   |            |                |       |
| `/os/clients/[id]/edit`                                                   |               |                   |            |                |       |
| Session detail (instructor view) — attendance recording                   |               |                   |            |                |       |
| `/os/revenue` empty state                                                 |               |                   |            |                |       |
| `/os/revenue` populated (after at least one Stripe payment)               |               |                   |            |                |       |
| `/os/revenue` CSV export trigger                                          |               |                   |            |                |       |
| Subscription upgrade flow (`/os/dashboard` → Subscribe → Stripe Checkout) |               |                   |            |                |       |
| Stripe Customer Portal flow (`/os/dashboard` → Manage subscription)       |               |                   |            |                |       |
| Stripe Connect onboarding start                                           |               |                   |            |                |       |

## Findings

Append-only log. One entry per non-PASS cell.

```
### YYYY-MM-DD — <surface> on <device> — <severity>
- Symptom (with screenshot path if applicable)
- Suspected cause
- Action: fix now / defer / ignore
```

(no entries yet)

## Decision

After running through every cell:

- Number of CRITICAL items: \_\_\_
- Number of MAJOR items: \_\_\_
- Number of COSMETIC items: \_\_\_
- Beta launch unblocked? yes / no

If unblocked: proceed to Mission 4 (beta candidate outreach).
If not: fix all CRITICAL items first; re-verify the affected surfaces
on the affected devices; update this doc; re-decide.
