/**
 * T-AV27c helpers for the Tribe Athletes end-to-end suite. LOCAL STACK ONLY:
 * every value here is a local seed value (scripts/av-seed-local.mjs and
 * scripts/av-seed-athletes.mjs), and the runner refuses anything else.
 */
import { execFileSync } from 'node:child_process';
import type { Browser, BrowserContext, Page, Response } from '@playwright/test';

export const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const PARTNER_A = ID(7000); // BullBox (Prueba)
export const PARTNER_B = ID(7001); // Otro Gym (Prueba), program off in the seed
const PASSWORD = 'tribe-local-1234';

const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** A signed-in browser context: the SSR session cookie from scripts/avSessionCookie.mjs, Spanish UI. */
export async function signedIn(browser: Browser, email: string, baseURL: string): Promise<BrowserContext> {
  const raw = execFileSync('node', ['scripts/avSessionCookie.mjs', email], { encoding: 'utf8' }).trim();
  const host = new URL(baseURL).hostname;
  const ctx = await browser.newContext();
  await ctx.addCookies(
    raw.split('; ').map((pair) => {
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: '/' };
    })
  );
  await spanish(ctx);
  return ctx;
}

/** An anonymous visitor, in Spanish. */
export async function anonymous(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  await spanish(ctx);
  return ctx;
}

async function spanish(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('language', 'es');
    } catch {
      // A storage-less context still renders; the server default is Spanish.
    }
  });
}

/** A JWT for a seed user, to read what the database says through PostgREST. */
export async function jwtFor(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`no JWT for ${email}`);
  return body.access_token;
}

/** Call an RPC as a seed user. */
export async function rpcAs<T>(email: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${await jwtFor(email)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return (await res.json()) as T;
}

/** The caller's own notifications of the T-AV types, newest first. */
export async function myAthleteNotifications(email: string): Promise<Array<{ type: string; message: string }>> {
  const res = await fetch(`${API}/rest/v1/notifications?select=type,message&type=like.av_*&order=created_at.desc`, {
    headers: { apikey: ANON, Authorization: `Bearer ${await jwtFor(email)}` },
  });
  return (await res.json()) as Array<{ type: string; message: string }>;
}

export interface SummaryTotals {
  invited: number;
  showed_up: number;
  joined: number;
  retained: number;
  to_close: number;
  bonus_owed?: number;
  bonus_settled?: number;
}

/**
 * Navigate and wait until the page has SETTLED. React streams each boundary's
 * content into a hidden container before swapping it into place, so for a
 * moment after "load" the same element can exist twice and a selector matches
 * both. Measured on 2026-10-01: /atletas/ showed two <h1> at load and one
 * 150ms later, with no console error; after networkidle, exactly one.
 */
export async function open(page: Page, path: string): Promise<Response | null> {
  return page.goto(path, { waitUntil: 'networkidle' });
}
