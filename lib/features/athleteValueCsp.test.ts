/**
 * T-AV0, Step 4. The CSP allowance for the LOCAL Supabase stack.
 *
 * WHY IT EXISTS, measured 2026-09-26: with the app pointed at
 * http://127.0.0.1:54321, `connect-src` allowed `https://*.supabase.co` and
 * nothing else, so the browser refused every request to the local stack.
 * Signing in returned "No account found with these credentials" while the same
 * credentials returned a token to curl in the same second. A CSP refusal is
 * not reported as a refusal anywhere the user or the developer looks -- it
 * surfaces as a failed fetch, which the auth form maps to its friendliest
 * error, so the symptom pointed at the data and the cause was in a header.
 *
 * Step 4.6 of the ticket -- open the app on a phone against the local stack --
 * was impossible until this, not merely awkward.
 *
 * THE ARM THAT MATTERS IS THE PRODUCTION ONE. Widening a CSP is the kind of
 * change that is easy to get subtly too generous, and the whole safety of this
 * one rests on the claim that it CANNOT fire for a production URL. So that is
 * asserted directly, for the real production host shape, rather than left as a
 * property of the code that a reader has to re-derive.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const ORIGINAL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** buildCsp reads process.env at call time, so each case needs a fresh import. */
async function cspFor(url: string | undefined): Promise<string> {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  vi.resetModules();
  const { buildCsp } = await import('@/middleware');
  return buildCsp();
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL;
});

describe('CSP allows the local Supabase stack, and only the local one', () => {
  it('adds the loopback origin and its websocket when the stack is local', async () => {
    const csp = await cspFor('http://127.0.0.1:54321');
    expect(csp).toContain('http://127.0.0.1:54321');
    // ws:, not wss: -- the local stack speaks plain http, and realtime over
    // wss to a loopback http server is refused by the browser regardless of
    // what the CSP permits.
    expect(csp).toContain('ws://127.0.0.1:54321');
  });

  it('accepts localhost as well as the numeric loopback', async () => {
    expect(await cspFor('http://localhost:54321')).toContain('http://localhost:54321');
  });

  it('adds NOTHING for a production Supabase URL', async () => {
    const prod = await cspFor('https://abcdefghijklmnop.supabase.co');
    const none = await cspFor(undefined);
    // Byte-identical to the no-variable case: the production directive is not
    // widened by one character. Asserting equality rather than "does not
    // contain 127.0.0.1" -- the second passes for a change that adds something
    // else entirely.
    expect(prod).toEqual(none);
    expect(prod).not.toContain('127.0.0.1');
    expect(prod).not.toContain('localhost');
  });

  it('adds nothing when the variable is not a URL at all', async () => {
    // An unparseable value must fall through to "no local origins", never to a
    // string spliced into a security header.
    expect(await cspFor('not-a-url')).toEqual(await cspFor(undefined));
    expect(await cspFor('')).toEqual(await cspFor(undefined));
  });

  it("adds the Mac's LAN address, because that is what a phone must use", async () => {
    // Step 4.6 is phone testing. From the phone, 127.0.0.1 is THE PHONE, so
    // .env.av.local has to name the Mac's LAN address -- and the first version
    // of this check was loopback-only, which would have silently re-broken the
    // exact case it was extended for.
    const csp = await cspFor('http://192.168.8.230:54321');
    expect(csp).toContain('http://192.168.8.230:54321');
    expect(csp).toContain('ws://192.168.8.230:54321');
    for (const lan of ['http://10.1.2.3:54321', 'http://172.20.0.4:54321']) {
      expect(await cspFor(lan)).toContain(lan);
    }
  });

  it('adds NOTHING over https, whatever the hostname', async () => {
    // The load-bearing half. Production Supabase is always https, so this one
    // condition is what makes the rule unable to widen a production CSP at
    // all -- no hostname reasoning required.
    const none = await cspFor(undefined);
    for (const url of [
      'https://abcdefghijklmnop.supabase.co',
      'https://127.0.0.1:54321',
      'https://192.168.8.230:54321',
      'https://localhost:54321',
    ]) {
      expect(await cspFor(url), url).toEqual(none);
    }
  });

  it('adds nothing for a PUBLIC address over http', async () => {
    // 8.8.8.8 is http and is not RFC 1918. Private-range membership is checked
    // on parsed octets, so a public address gets nothing even in plaintext.
    expect(await cspFor('http://8.8.8.8:54321')).toEqual(await cspFor(undefined));
    expect(await cspFor('http://172.32.0.1:54321')).toEqual(await cspFor(undefined)); // just past 172.16/12
    expect(await cspFor('http://192.169.0.1:54321')).toEqual(await cspFor(undefined)); // just past 192.168/16
  });

  it('does not treat a hostname that merely CONTAINS localhost as local', async () => {
    // `localhost.evil.com` resolves wherever its owner says. The check is
    // equality on the hostname, and this is the arm that proves it, because a
    // `.includes('localhost')` implementation would pass every case above.
    const sneaky = await cspFor('http://localhost.attacker.example');
    expect(sneaky).toEqual(await cspFor(undefined));
  });
});
