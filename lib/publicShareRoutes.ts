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
  if (!pathname) return false;
  return PUBLIC_SHARE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
