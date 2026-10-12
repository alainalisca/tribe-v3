# TICKET: six section backgrounds 404 in production (landing, /auth, /onboarding/role)

Found 2026-10-11 during T-PARTNER-METRIC1 (a signed-out headless load of
https://tribelatam.com/ logged two 404s; checking every `/marketing/*-bg.jpg`
the code references found six). Not fixed here. This note is the ticket.

## What is broken

Every image below is referenced on `main` and returns **404** from
tribelatam.com (measured 2026-10-11 with `curl`). The sections render on a
flat background instead of the photo.

| Image                            | Referenced by                                               | In git anywhere?                           |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `/marketing/faq-bg.jpg`          | `components/marketing/landing/FAQPreviewSection.tsx:92`     | yes, branch `feature/homepage-real-photos` |
| `/marketing/howitworks-bg.jpg`   | `components/marketing/landing/HowItWorksSection.tsx:146`    | yes, same branch                           |
| `/marketing/instructors-bg.jpg`  | `components/marketing/landing/ForInstructorsPreview.tsx:55` | yes, same branch                           |
| `/marketing/testimonials-bg.jpg` | `components/marketing/landing/TestimonialsSection.tsx:75`   | yes, same branch                           |
| `/marketing/auth-bg.jpg`         | `app/auth/page.tsx:63`                                      | **no, never committed**                    |
| `/marketing/onboarding-bg.jpg`   | `app/onboarding/role/page.tsx:164`                          | **no, never committed**                    |

The original report named only the first two because the headless load stopped
before the lazily mounted sections fetched theirs.

## Why

Commit `d7afc93d` (2026-09-24, "Landing: real photos below the hero, yoga tile
swap, no stock faces") added the four landing backgrounds; its message says it
"adds the four /marketing/\*-bg.jpg section backgrounds that were referenced but
missing (404s)". That commit lives only on `feature/homepage-real-photos`, which
was **never pushed to origin** (it exists locally and on the `backup` remote)
and is now 98 commits behind `main`, 4 ahead. So the fix was written and never
shipped. `auth-bg.jpg` and `onboarding-bg.jpg` were never added at all.

## What the branch carries besides the four images

Its four commits also change the landing page itself: hero tile swaps
(`ba5563d8`, `2649ed3b`, `c3a08c31`) and, in `d7afc93d`, new `public/landing-*.jpg`
photos, a new final-CTA background, the For Athletes and For Instructors photos,
and testimonial avatars replaced by initials. Merging it is a content decision,
not just a file restore.

## Options (Al's call)

1. **Ship the branch.** Rebase or merge `feature/homepage-real-photos` onto
   `main`, review the landing changes on a preview, merge. Fixes four of six.
2. **Restore only the four files** from `d7afc93d`
   (`git checkout d7afc93d -- public/marketing/{faq,howitworks,instructors,testimonials}-bg.jpg`)
   on a small branch, leaving the landing redesign for later. Fixes four of six.
3. For `auth-bg.jpg` and `onboarding-bg.jpg`: supply two photos, or remove the
   `backgroundImage` from those two pages so they stop requesting a file that
   does not exist.

## Guard worth adding with the fix

A test that every `/marketing/*.jpg` (and any `url(/...)` / `src="/..."` asset)
referenced in `app/` and `components/` exists under `public/`. That turns this
class of silent 404 into a red build.
