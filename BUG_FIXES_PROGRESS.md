# QA Round 1 — Bug fix progress

Spec: `Claude_Code_QA_Round1_Bug_Fix_Spec.md.docx`. Updated per commit.

## Session 1 — BROKEN

- [x] BUG-002 Q&A session_comments (62d0912 — migration needed; see USER_ACTION_NEEDED)
- [x] BUG-001 Session not found false-positive (3f29191)
- [x] BUG-003 Pay & Join no-op (5e042a2 — now toasts + logs)
- [x] BUG-004 Participant click → User not found (073ee03)
- [x] BUG-005 Referral code empty (0a6381a — migration needed)
- [x] BUG-008 Wrong profile stats (70/24/94) (291cd0d)
- [x] BUG-007 Profile photo/banner not saving (561ad39)
- [x] Sport images 404 (f372daf — gradient-only until real images uploaded)

## Session 1 — additional broken

- [x] BUG-006 Follow button does nothing (819ccd7 — toast on success)
- [x] BUG-009 Tribe.OS attendance error messaging (d52ad1c — upgrade prompt)
- [x] BUG-010 Community banner upload error surfacing (be0ec59)
- [x] BUG-011 Stripe Connect account create (fd9cdfa — surfaces real error)

## Session 2 — WRONG

- [x] BUG-012 "6+" neighborhoods → real count (9cf645f)
- [x] BUG-013 WhatsApp emojis broken (9cf645f)
- [x] BUG-014 Legal email admin@ → tribe@ (9cf645f)
- [x] BUG-015 Local Fitness Events links (77ea205 — whole card clickable / hint)
- [x] BUG-016 Pre-fill location on create (80c06c7)
- [x] BUG-017 Referral reward copy (9cf645f)
- [x] BUG-018 Tip modal copy (n/a — superseded by #7)
- [x] BUG-019 Storefront empty visible to non-owners (a30d2cb)
- [x] BUG-020 Onboarding modal re-pops + dark (dfe8c25 — dark fixed; persistence localStorage)
- [x] BUG-021 Cover image URL → upload (6bf3431 — community create)

## Session 3 — UGLY

- [x] BUG-022 Share button contrast (6aeb485)
- [x] BUG-024 Host buttons layout (77ea205 — grid-cols-2 pairings)
- [x] BUG-025 Tribe logo period → CSS circle (be0ec59 + bulk script)
- [x] BUG-026 Storefront pb-24 (6aeb485)
- [x] BUG-027 Storefront fallback / name capitalization (87ffddd)
- [x] BUG-028 Description formatting (links + line breaks) (6aeb485)
- [x] BUG-029 / BUG-033 Sport tags as pills (6aeb485)
- [x] BUG-030 Add Story modal centering (87ffddd)
- [x] BUG-031 Calendar UX toast (77ea205)
- [x] BUG-032 Consistent loading state (77ea205 — three page-level spinners; rest are inline)
- [x] BUG-034 Profile photo lightbox (77ea205 — own profile; /[userId] already had one)
- [x] BUG-036 Desktop camera label (6aeb485)

## Deferred per spec

- [ ] BUG-023 Map artifact (OSM data; not code)
- [ ] BUG-035 Banner repositioning (design needed)
- [ ] BUG-037 Referral tracking backend (design decision)
