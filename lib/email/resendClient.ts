/**
 * T-AV19 Part B. The ONE place a Resend client is created.
 *
 *   const resend = getResendClient('passLead');
 *   const { error } = await resend.emails.send({ ... });
 *
 * In live mode this is a real Resend client. In log mode (lib/notify/sendMode)
 * it is a stand-in that writes one structured line and returns the same
 * success shape Resend returns, `{ data: { id }, error: null, headers: null }`,
 * without constructing Resend at all. Callers do not branch on the mode; a
 * caller that reads `error` or `data.id` gets a well-formed answer either way.
 *
 * Why one factory: before T-AV19 there were 14 independent `new Resend(key)`
 * calls, and "log mode" was enforced by nothing except a missing API key
 * (recon F8). A mode check has to sit where every send passes, and a
 * source-scan test (resendClient.singleSource.test.ts) fails if `new Resend(`
 * appears anywhere else, so a 15th call site cannot quietly bypass it.
 *
 * Only `emails.send` is exposed, because it is the only method any caller in
 * this repo uses. Adding a method means adding its log-mode twin here.
 */
import { Resend, type CreateEmailOptions, type CreateEmailResponse } from 'resend';
import { log } from '@/lib/logger';
import { emailMode, maskEmail } from '@/lib/notify/sendMode';

/** What every caller in the app actually uses. */
export interface EmailClient {
  emails: {
    send(payload: CreateEmailOptions): Promise<CreateEmailResponse>;
  };
}

const MISSING_KEY = 'RESEND_API_KEY is not configured';

function recipients(to: CreateEmailOptions['to']): string {
  const list = Array.isArray(to) ? to : [to];
  return list.map((a) => maskEmail(String(a))).join(',');
}

/** The log-mode stand-in. Never touches the network, never needs a key. */
function loggingClient(template: string): EmailClient {
  return {
    emails: {
      async send(payload) {
        log('info', `[email:log] to=${recipients(payload.to)} subject=${payload.subject ?? ''} template=${template}`, {
          action: 'email_log_mode',
          template,
        });
        return { data: { id: `log-${Date.now().toString(36)}` }, error: null, headers: null };
      },
    },
  };
}

/**
 * A client for `template` (a short name for the log line, e.g. 'passLead').
 * Live mode with no RESEND_API_KEY throws, exactly as each call site did
 * before this factory existed. Log mode needs no key.
 */
export function getResendClient(template: string): EmailClient {
  if (emailMode() === 'log') return loggingClient(template);
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error(MISSING_KEY);
  return new Resend(key);
}

/**
 * Same, for the one caller that treats a missing key as "skip, and log it"
 * rather than an exception (the feedback widget).
 */
export function getResendClientOrNull(template: string): EmailClient | null {
  if (emailMode() === 'log') return loggingClient(template);
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}
