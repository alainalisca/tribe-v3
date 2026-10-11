/**
 * Newsletter contact sync: the I/O. Reads both sides, asks planContactSync
 * what to change, and makes the changes.
 *
 * PACING. Resend's API is rate-limited per team (2 requests per second on the
 * default plan). Every Resend call here waits CALL_SPACING_MS first, and a run
 * makes at most MAX_RESEND_WRITES writes. Whatever is left over is picked up by
 * the next daily run, because the plan is recomputed from scratch every time:
 * nothing about a half-finished run needs remembering.
 *
 * CONTAINMENT. One failed write is recorded and the loop continues. A loop
 * over people must not let person 3's failure decide whether persons 4 to 80
 * are handled (CLAUDE.md, the one-off nudge's first real send). A 429 is the
 * exception: it means "stop for today", so the run ends early and says so.
 *
 * ORDER. Pull (app writes) first, then push, remove, create. Pull is the one
 * that protects a person's stated wish, so it never waits behind a rate limit.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorResponse } from 'resend';
import type { ContactsClient } from '@/lib/email/resendClient';
import { setEmailUnsubscribed } from '@/lib/dal/emailUnsubscribe';
import { fetchNewsletterAudience } from '@/lib/dal/newsletterAudience';
import { logError } from '@/lib/logger';
import { maskEmail } from '@/lib/notify/sendMode';
import { planContactSync, type ResendMember } from './contactSyncPlan';

export const CALL_SPACING_MS = 600;
export const MAX_RESEND_WRITES = 40;
const LIST_PAGE = 100;

export interface ContactSyncSummary {
  appMembers: number;
  resendContacts: number;
  pulled: number;
  pushed: number;
  removed: number;
  created: number;
  failed: number;
  /** Writes the plan wanted that this run did not reach (cap or rate limit). */
  deferred: number;
  refused: string | null;
  rateLimited: boolean;
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(error: ErrorResponse | null | undefined): boolean {
  return !!error && (error.statusCode === 429 || error.name === 'rate_limit_exceeded');
}

async function listAllContacts(client: ContactsClient, sleep: Sleep): Promise<ResendMember[]> {
  const out: ResendMember[] = [];
  let after: string | undefined;
  for (;;) {
    await sleep(CALL_SPACING_MS);
    const { data, error } = await client.contacts.list(after ? { limit: LIST_PAGE, after } : { limit: LIST_PAGE });
    if (error || !data) throw new Error(`contacts.list: ${error?.message ?? 'no data'}`);
    for (const c of data.data) out.push({ contactId: c.id, email: c.email, unsubscribed: c.unsubscribed });
    if (!data.has_more || data.data.length === 0) break;
    after = data.data[data.data.length - 1].id;
  }
  return out;
}

export async function runContactSync(
  supabase: SupabaseClient,
  client: ContactsClient,
  sleep: Sleep = realSleep
): Promise<ContactSyncSummary> {
  const audience = await fetchNewsletterAudience(supabase);
  if (!audience.success || !audience.data) throw new Error(audience.error ?? 'audience read failed');
  const contacts = await listAllContacts(client, sleep);

  const plan = planContactSync(audience.data, contacts);
  const summary: ContactSyncSummary = {
    appMembers: audience.data.length,
    resendContacts: contacts.length,
    pulled: 0,
    pushed: 0,
    removed: 0,
    created: 0,
    failed: 0,
    deferred: 0,
    refused: plan.refused,
    rateLimited: false,
  };

  // 1. PULL: app writes, never rate-limited, never capped.
  for (const userId of plan.pullUnsubscribe) {
    const res = await setEmailUnsubscribed(supabase, userId);
    if (res.success) summary.pulled++;
    else {
      summary.failed++;
      logError(new Error(res.error ?? 'setEmailUnsubscribed failed'), { action: 'contactSync_pull', userId });
    }
  }

  // 2-4. Resend writes, in priority order, paced and capped.
  type Write = {
    kind: 'pushed' | 'removed' | 'created';
    ref: string;
    call: () => Promise<{ error: ErrorResponse | null }>;
  };
  const writes: Write[] = [
    ...plan.pushUnsubscribe.map<Write>((id) => ({
      kind: 'pushed',
      ref: id,
      call: () => client.contacts.update({ id, unsubscribed: true }),
    })),
    ...plan.remove.map<Write>((id) => ({ kind: 'removed', ref: id, call: () => client.contacts.remove({ id }) })),
    ...plan.create.map<Write>((c) => ({
      kind: 'created',
      ref: maskEmail(c.email),
      call: () =>
        client.contacts.create({
          email: c.email,
          unsubscribed: false,
          ...(c.firstName ? { firstName: c.firstName } : {}),
          properties: { role: c.role },
        }),
    })),
  ];

  let done = 0;
  for (const w of writes) {
    if (done >= MAX_RESEND_WRITES) break;
    await sleep(CALL_SPACING_MS);
    done++;
    try {
      const { error } = await w.call();
      if (!error) {
        summary[w.kind]++;
        continue;
      }
      if (isRateLimit(error)) {
        summary.rateLimited = true;
        done--; // not attempted in any useful sense; it stays deferred
        break;
      }
      summary.failed++;
      logError(new Error(error.message ?? 'resend contact write failed'), {
        action: `contactSync_${w.kind}`,
        ref: w.ref,
      });
    } catch (error) {
      summary.failed++;
      logError(error, { action: `contactSync_${w.kind}`, ref: w.ref });
    }
  }
  summary.deferred = writes.length - done;
  return summary;
}
