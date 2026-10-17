/**
 * T-SITE1.1 Part C. Hosts next/image may optimise, mirroring images.remotePatterns
 * in next.config.ts. A remote avatar on any other host would make next/image
 * throw, so the roster shows the coach's initials instead.
 */
const HOSTS = [/\.supabase\.co$/, /\.googleapis\.com$/, /^lh3\.googleusercontent\.com$/, /^images\.unsplash\.com$/];

export function isOptimizableImage(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}
