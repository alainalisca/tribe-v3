/**
 * T-AV19 Part B. Does this process send real email and push, or only log them?
 *
 *   emailMode()  'log' | 'live'
 *   pushMode()   'log' | 'live'
 *
 * SERVER ONLY. Import it from route handlers and lib modules that run on the
 * server; never from a client component.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE, IN ORDER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. The Supabase URL the server uses (NEXT_PUBLIC_SUPABASE_URL) points at
 *      localhost, 127.0.0.1 or [::1]           -> 'log', whatever the env says
 *   2. EMAIL_MODE / PUSH_MODE is exactly 'log'  -> 'log'
 *   3. anything else, including unset           -> 'live'
 *
 * Unset means live ON PURPOSE (decided 2026-09-26): production has neither
 * variable, so after the merge `main` sends exactly as it does today and no
 * Vercel change is needed. The branch is protected by `.env.av.local` setting
 * both to 'log', by av-guard refusing to run when either resolves to live, and
 * by rule 1.
 *
 * Rule 1 is the fail-safe. A process talking to the LOCAL database is, by
 * construction, not production, and the rows it would be emailing about are
 * seed rows with invented addresses. So even a shell that lost its env file,
 * or exported EMAIL_MODE=live by accident, cannot send real mail while it
 * points at the local stack.
 *
 * This file has no path aliases and no imports, so scripts/av-guard.mjs and
 * scripts/av-dev.mjs can load it with Node's type stripping and ask the SAME
 * function the app asks, instead of re-implementing the rule in a script.
 */

export type SendMode = 'log' | 'live';
export type SendChannel = 'email' | 'push';

/** Why the mode came out the way it did, so a guard can print it. */
export type SendModeReason = 'local-supabase' | 'env-log' | 'default-live';

export interface ResolvedSendMode {
  mode: SendMode;
  reason: SendModeReason;
}

type Env = Record<string, string | undefined>;

const ENV_KEY: Record<SendChannel, string> = { email: 'EMAIL_MODE', push: 'PUSH_MODE' };

/**
 * `new URL('http://[::1]:54321').hostname` is `[::1]` in Node and in browsers,
 * brackets included, so both spellings are listed.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** True when the URL's host is this machine. An unparseable URL is not local. */
export function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function resolveSendMode(channel: SendChannel, env: Env = process.env): ResolvedSendMode {
  if (isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)) return { mode: 'log', reason: 'local-supabase' };
  if (env[ENV_KEY[channel]] === 'log') return { mode: 'log', reason: 'env-log' };
  return { mode: 'live', reason: 'default-live' };
}

export function emailMode(env: Env = process.env): SendMode {
  return resolveSendMode('email', env).mode;
}

export function pushMode(env: Env = process.env): SendMode {
  return resolveSendMode('push', env).mode;
}

/** `ana@example.com` -> `a***@example.com`. Log lines outlive the retention we promise. */
export function maskEmail(address: string): string {
  const at = address.indexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}
