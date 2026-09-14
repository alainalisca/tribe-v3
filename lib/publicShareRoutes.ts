/**
 * Routes a stranger lands on from outside the app.
 *
 * These are the front doors: a link in an Instagram bio, a WhatsApp invite. The
 * person on the other end has not decided whether Tribe is for them yet, so
 * in-app chrome aimed at existing users does not belong on them -- not the
 * app-install modal three seconds in, and not an internal bug-reporting tool.
 *
 *   /invite/  the growth mechanic's front door
 *   /g/       a gym's public page -- the destination of an Instagram bio link
 *   /i/       an instructor's public page, same funnel
 *
 * ONE list, consumed by IOSInstallPrompt and FeedbackWidget, so the next public
 * route is registered in one place rather than two. Both previously carried
 * their own route check, and only one of them had been updated for /g/ and /i/.
 *
 * NOT the same thing as middleware's `publicPaths`, and deliberately not shared
 * with it: that list answers "does this route need a session", which is a
 * superset (it holds /s/, /about, /faq, /download, static assets). This one
 * answers "is this a stranger's first impression". /s/ is the case that shows
 * the difference -- it is public, but a shared session is mid-funnel and
 * booking it needs the app, so the install prompt there is arguably doing its
 * job. That judgement is recorded in NAV-02.
 */
export const PUBLIC_SHARE_ROUTE_PREFIXES = ['/invite/', '/g/', '/i/'] as const;

/**
 * True on a public share route.
 *
 * Prefix match INCLUDING the trailing slash, so nothing else is swept up:
 * /instructors, /groups/1 and /invitations all fail it.
 */
export function isPublicShareRoute(pathname: string | null | undefined): boolean {
  return matchesPrefix(pathname, PUBLIC_SHARE_ROUTE_PREFIXES);
}

/**
 * Routes a person is in the middle of CREATING AN ACCOUNT on.
 *
 * A SECOND LIST ON PURPOSE. These are not public share routes -- they are
 * auth-gated (or the auth screen itself) and nobody arrives at them from a
 * stranger's link. They belong here for a different reason: they sit directly
 * in front of the signup funnel, and a full-screen "get the app" modal there
 * sends someone to the App Store in the middle of creating the account they
 * came to create.
 *
 * The concrete case T-GYM4 built and this protects: a gym owner opens the link
 * on their phone, hits an install wall before /onboarding/role, bounces to the
 * store, and never reaches the application form.
 *
 * WHY NOT JUST ADD THEM TO THE LIST ABOVE. Both lists are string[] and a union
 * would "work", which is exactly the trap: that list answers "is this a
 * stranger's first impression" and onboarding is not one. Merging them would
 * mean FeedbackWidget starts suppressing itself on /auth and /onboarding as a
 * side effect of a decision about the install prompt, with nothing in either
 * list recording why. Data shaped for one consumer handed to another.
 *
 * So: two lists, two reasons, and one union function below for the single
 * consumer that needs both.
 */
export const SIGNUP_FLOW_PREFIXES = ['/auth/', '/onboarding/', '/partners/apply/'] as const;

/**
 * Prefix match, tolerating the slash-less form.
 *
 * next.config has trailingSlash: true so the served pathname is '/auth/', but
 * usePathname can report '/auth' during a client-side transition, and a prefix
 * test alone would miss it for one render -- long enough for a 3s timer to be
 * armed on a route that should never arm it.
 */
function matchesPrefix(pathname: string | null | undefined, prefixes: readonly string[]): boolean {
  if (!pathname) return false;
  return prefixes.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

/**
 * The install prompt's question, and ONLY the install prompt's question: the
 * union of "a stranger's first impression" and "mid-signup".
 *
 * FeedbackWidget deliberately does NOT use this. Its question has not changed --
 * an internal bug reporter does not belong on a public share page -- and it has
 * no reason to disappear from /auth or /onboarding.
 */
export function shouldSuppressInstallPrompt(pathname: string | null | undefined): boolean {
  return isPublicShareRoute(pathname) || matchesPrefix(pathname, SIGNUP_FLOW_PREFIXES);
}
