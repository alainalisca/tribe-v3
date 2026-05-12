# Beta retrospective — TEMPLATE

Copy this file to `docs/BETA_RETROSPECTIVE_YYYY-MM-DD.md` (today's date)
at the end of Week 4 and fill in. The dated copy is the actual artifact;
this file is the empty mold.

The retrospective is the most valuable document of the four-week build
because it is the first real signal. Take time on it. Half a day is
appropriate. Quotes verbatim — do not paraphrase what instructors
actually said.

---

## What worked

What ran smoothly. Cite specific quotes from instructors. Cite specific
usage data: clients added per instructor, sessions created, payments
taken, revenue generated, dashboard views.

- (item)
- (item)

## What broke

Every bug surfaced during beta, categorized by severity. Note which
ones got fixed mid-beta and which were deferred to LATER.md.

| Date | Reporter | Symptom | Severity | Fix shipped | Notes |
| ---- | -------- | ------- | -------- | ----------- | ----- |
|      |          |         |          |             |       |

## What instructors actually used vs ignored

This is the validation signal Phase 1 was supposed to gather. Compare
the planned feature set against what got used.

| Feature                                           | Heavily used | Lightly used | Ignored |
| ------------------------------------------------- | ------------ | ------------ | ------- |
| Manage clients (`/os/clients`)                    |              |              |         |
| Add tags to clients                               |              |              |         |
| Private notes on clients                          |              |              |         |
| Attendance recording on session detail            |              |              |         |
| Record payment on attendance                      |              |              |         |
| Create paid sessions (`/create` with price)       |              |              |         |
| Take payment via Stripe Connect                   |              |              |         |
| Revenue dashboard (`/os/revenue`) — summary cards |              |              |         |
| Revenue dashboard — chart                         |              |              |         |
| Revenue dashboard — payment table                 |              |              |         |
| Revenue dashboard — period selector               |              |              |         |
| Revenue dashboard — CSV export                    |              |              |         |
| Subscription portal (cancel / payment method)     |              |              |         |

For anything in the "Ignored" column, ask: do we drop it from the
post-beta product, or do we believe in it and improve discoverability?

## Pricing reaction

What did instructors say about $30/month vs 15% revenue share? Did
anyone push back on either? Did anyone volunteer to pay sooner than
the 90-day mark?

- (item)
- (item)

## Verbatim quotes

The instructors' actual words. Not summaries. Most useful data in the
whole doc.

> "..."
> — {instructor name}, {date}

> "..."
> — {instructor name}, {date}

## Feature requests

Everything anyone asked for that we did not have. Counted, ranked.
Cross-reference with `docs/LATER.md` (every feature request should
already be there).

| Request | Asked by | Count | Priority signal | Status |
| ------- | -------- | ----- | --------------- | ------ |
|         |          |       |                 |        |

## Decision matrix for Week 5

Four paths. Al picks one.

- [ ] **A. Continue beta, expand to 3-5 more instructors.**
      Default if launch was smooth and the feature set is roughly right.
      Week 5 = outreach round 2 + bug-fix sprint based on Week 4 findings.

- [ ] **B. Promote to wider launch.**
      Add public Tribe.OS marketing, open premium signups to anyone with
      a credit card. Only if beta was strongly positive AND the few
      features used are clearly the right ones AND zero critical issues
      surfaced.

- [ ] **C. Pivot based on usage.**
      If instructors only used a subset of features and ignored others,
      refocus accordingly. Week 5 = build the thing they actually wanted
      (which may not have been in the original Phase 2 plan at all).

- [ ] **D. Bug-fix sprint.**
      If critical issues surfaced during beta and the experience is
      shakier than the audit suggested, dedicate Week 5 to hardening
      before any further launch activity.

**Picked path:** \_\_\_

**Rationale:**

(paragraph)

## Week 5 scope (if continue or promote)

If A or B: one-pager outline of the Week 5 missions. Same shape as
the Week 4 spec but condensed.

## Week 5 spec request (if pivot or bug-fix)

If C or D: a list of specific missions to feed back to the spec author
for the next planning round. What's the new scope? Why?
