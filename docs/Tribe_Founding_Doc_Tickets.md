# Tribe: Tickets and Tasks from the Founding Document

**What this is.** The actionable layer that comes out of the Founding Document and the `Tribe_Strategy_Reconciliation_Spec.md`. It is intentionally small. The Founding Document's core discipline is that it changes your defaults, not your backlog, so this file is not a fifteen-part build plan. It is a short, phased list where most items are posture, copy, ops, and measurement, and only a couple touch code. Work through them progressively.

Last updated: 2026-07-31.

---

## How to use this file

**The master filter.** Before starting any ticket, or any decision at all, ask: _does this make someone more visible, more seen, or more backed?_ If no, it is probably a distraction.

**The discipline rule.** If a ticket is influencing a message you were already going to send, a field you were already going to add, or a line of copy you were already going to write, good, that is it working. If it is spawning a brand-new thing to build during validation, stop, that is the trap.

**The tiers.**

- **Tier 0, Now.** Validation-serving. Ops, copy, and measurement. Little or no code. Do these first.
- **Tier 1, Near-term.** Light build. Data-model orientation and minimal profile surfacing. Only as they serve validation.
- **Tier 2, Parked.** Layer 3. Preserved and explicitly not to be built now.

Priority note: the single highest-leverage item is T-03 (the gym pilot), because it is the moat, the traction slope, and the accelerator story all at once. If you only do one thing, do that.

---

## Tier 0, Now (validation-serving, low or no build)

### T-01 · Make "we promote you" the lead line in instructor outreach

- **Layer:** 2. **Type:** copy/ops.
- **Why (filter):** it is the answer to "give instructors a better reason to use the app." It makes them feel seen from first contact.
- **Scope:** update the instructor outreach and onboarding scripts so the opening offer is "you focus on training, we make you seen," not "here is what the app does." Ana's current reminder message already carries this, tighten it so promotion is the headline, not a middle paragraph.
- **Done when:** every new instructor contact leads with the promotion offer, and the standing outreach doc reflects it.
- **Boundary:** this is a wording and posture change, not a new asset or feature.

### T-02 · Add "what's your story?" and a media ask to instructor onboarding

- **Layer:** 2. **Type:** ops.
- **Why (filter):** it signals what Tribe values and collects the raw material (story plus media) that the promotion engine runs on.
- **Scope:** Ana asks each instructor, as part of onboarding, for their story and their best existing photos and videos. Capture it somewhere simple and consistent (the outreach master sheet or a lightweight intake). No new screen required yet.
- **Done when:** onboarding a new instructor reliably produces a short story and a few media assets on file.
- **Cost flag:** use existing footage and simple edits first. Defer any studio, white background, gear, or paid headshots until the pipeline justifies the spend. Do not let the media offer become a capital expense before demand is validated.

### T-03 · Run the gym-partnership pilot (BullBox / Zona de Combate)

- **Layer:** 1 and 2. **Type:** growth/ops. **Priority: highest.**
- **Why (filter):** clustered acquisition (a whole gym's roster at once) is the structural moat, and it is also the cleanest way to produce the week-over-week traction slope the accelerator applications need. Moat, validation, and fundraising story in one action.
- **Scope:** pick one gym, onboard its instructors and members as a cohort, run the promotion engine for them, and track what happens. Anchor to Zona (Al's home gym, BJJ with Santiago) or BullBox as the first wedge.
- **Done when:** one gym is live on Tribe as a cluster, with its instructors posting sessions and its members joining, and the activity is being measured (see T-04).
- **Boundary:** one gym, proven, before any repeatable rollout. Resist signing five gyms before one works.

### T-04 · Instrument the growth slope

- **Layer:** 1. **Type:** measurement.
- **Why (filter):** "trust that Tribe will work" becomes real when you can see it working. The accelerator spec's biggest gap is exactly this number.
- **Scope:** track weekly: instructors onboarded, sessions created, sessions joined, paid sessions, and active users. A simple sheet is fine. The point is the trend line, not the tooling.
- **Done when:** there is a living weekly record showing the direction of travel, ready to screenshot for an application.
- **Boundary:** do not build an analytics dashboard. A spreadsheet updated weekly is the whole ticket.

### T-05 · Close the "you were featured" loop

- **Layer:** 2. **Type:** ops.
- **Why (filter):** the promotion only builds loyalty if the instructor knows it happened. Telling them completes the "we make you seen" promise.
- **Scope:** when the social rotation features an instructor, Ana lets that instructor know and, where natural, shares the post so they can reshare. Ties directly to the existing rotation calendar.
- **Done when:** featured instructors are consistently notified, and resharing becomes a normal habit.
- **Boundary:** a message and a reshare, nothing to build.

---

## Tier 1, Near-term (light build, data-model orientation)

### T-06 · Orient the data model around people-with-stories-and-media

- **Layer:** 2 and 3 foundation. **Type:** schema/code.
- **Why (filter):** the one code-level move the Founding Document endorses now. If a person can hold a narrative, media, and a public presence (even if empty), then Layers 2 and 3 become a fill-in later, not a rebuild. It also creates exactly the data a future data scientist and the sponsorship model will need.
- **Scope:** ensure the person/instructor/athlete model carries nullable fields for story, media references, and public-presence signals. Additive only. No behavior change required yet.
- **Done when:** the schema can represent a person as someone to be promoted, not only tracked, without a migration rewrite later.
- **Boundary:** add the shape, not the features on top of it. Do not build a storytelling module.

### T-07 · Surface an instructor story and media block on the public profile

- **Layer:** 2. **Type:** light UI.
- **Why (filter):** it turns the collected stories and media (T-02) into visible promotion on the surface athletes already see.
- **Scope:** display the story and a few media items on the instructor profile using the fields from T-06. Minimal UI, fill existing fields.
- **Done when:** an instructor's profile shows their story and media to athletes.
- **Boundary:** only if it serves validation. If it is not helping instructors feel seen or athletes choose, defer it.

### T-08 · Default-to-visible review pass

- **Layer:** all. **Type:** posture applied to product.
- **Why (filter):** in ambiguous product moments, defaulting toward "makes this person more seen" (where safe) compounds the moat over time.
- **Scope:** when a product decision is genuinely ambiguous, choose the option that increases a person's visibility, provided it is safe and privacy-respecting. This is a habit, captured here so it is explicit.
- **Done when:** it is a standing lens, not a one-time task.
- **Boundary:** never at the expense of user safety or privacy.

---

## Tier 2, Parked (Layer 3, do not build now)

Preserved so they are not lost. Building any of these during validation is the trap the Founding Document names.

- **P-01 · Amateur-athlete sponsorship marketplace.** Broker small brands and micro-athletes; Tribe sits in the middle because it has both the athletes and the media that proves their reach. Highest-potential parked idea. Gated on having real reach and engagement data (which T-06 quietly starts collecting). Revisit after Layers 1 and 2 are validated.
- **P-02 · Tribe.TV.** The storytelling brand and eventual standalone media asset.
- **P-03 · In-person events and tabling.** More surface area for instructors to meet new clients and for the public to interact with instructors.
- **P-04 · Film, cinematography, music production capability.** Tribe as the container for the things you want to learn, applied to the brand. Real cost, real time, strictly post-validation.
- **P-05 · "Everyone is an athlete" content series.** The belief system as a recurring media format. Note: a lightweight version can live inside the existing social rotation as content, which costs nothing, before it ever becomes a production.

---

## Suggested sequence

1. T-01 and T-05 immediately (pure copy and ops, no cost, done this week).
2. T-04 in parallel (start the weekly slope record now so the trend has history when you apply anywhere).
3. T-03 as the main effort (the gym pilot is the needle-mover).
4. T-02 alongside the pilot (collect stories and media as instructors come in through the gym).
5. T-06 when you next touch the schema anyway (additive, cheap, future-proofing).
6. T-07 only if the pilot shows athletes want richer instructor profiles.
7. Everything in Tier 2 stays parked until Layers 1 and 2 are validated.
