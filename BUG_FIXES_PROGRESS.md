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
- [ ] BUG-010 Community banner upload (pending)
- [x] BUG-011 Stripe Connect account create (fd9cdfa — surfaces real error)

## Session 2 — WRONG

- [x] BUG-012 "6+" neighborhoods → real count (9cf645f)
- [x] BUG-013 WhatsApp emojis broken (9cf645f)
- [x] BUG-014 Legal email admin@ → tribe@ (9cf645f)
- [ ] BUG-015 Local Fitness Events links (pending — needs data audit)
- [x] BUG-016 Pre-fill location on create (80c06c7)
- [x] BUG-017 Referral reward copy (9cf645f)
- [x] BUG-018 Tip modal copy (n/a — superseded by #7)
- [x] BUG-019 Storefront empty visible to non-owners (a30d2cb)
- [x] BUG-020 Onboarding modal re-pops + dark (dfe8c25 — dark fixed; persistence localStorage)
- [x] BUG-021 Cover image URL → upload (6bf3431 — community create)

## Session 3 — UGLY

- [ ] BUG-022 Share button contrast
- [ ] BUG-024 Host buttons layout
- [ ] BUG-025 Tribe logo period
- [ ] BUG-026 Storefront pb-24
- [ ] BUG-027 Storefront fallback (banner/avatar/case)
- [ ] BUG-028 Description formatting (links + line breaks)
- [ ] BUG-029 / BUG-033 Sport tags as pills
- [ ] BUG-030 Add Story modal centering
- [ ] BUG-031 Calendar UX (web toast / native)
- [ ] BUG-032 Consistent loading state
- [ ] BUG-034 Profile photo lightbox
- [ ] BUG-036 Desktop camera label

## Deferred per spec

- [ ] BUG-023 Map artifact (OSM data; not code)
- [ ] BUG-035 Banner repositioning (design needed)
- [ ] BUG-037 Referral tracking backend (design decision)
