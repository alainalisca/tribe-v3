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
 * Only `emails.send` is exposed on the email client, because it is the only
 * method any sending caller uses. Adding a method means adding its log-mode
 * twin here. Contacts have their own client and key, below.
 */
import {
  Resend,
  type CreateContactOptions,
  type CreateContactResponse,
  type CreateEmailOptions,
  type CreateEmailResponse,
  type ListContactsOptions,
  type ListContactsResponse,
  type RemoveContactOptions,
  type RemoveContactsResponse,
  type UpdateContactOptions,
  type UpdateContactResponse,
} from 'resend';
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

/**
 * The newsletter contact list (Resend Contacts), used only by the daily
 * contact sync (app/api/cron/newsletter-contacts).
 *
 * A SEPARATE KEY, RESEND_CONTACTS_API_KEY. The sending key is restricted to
 * "Sending access" for one domain, which is the right blast radius for 14 send
 * sites and cannot read or write contacts at all. Widening it to full access
 * so one daily job could manage the list would hand that power to every send
 * site too. So the contacts job gets its own full-access key, and nothing else
 * reads it.
 *
 * LOG MODE reads an empty list and logs every write instead of making it, so a
 * local or branch run can exercise the whole job without touching the real list.
 */
export interface ContactsClient {
  contacts: {
    list(options?: ListContactsOptions): Promise<ListContactsResponse>;
    create(payload: CreateContactOptions): Promise<CreateContactResponse>;
    update(payload: UpdateContactOptions): Promise<UpdateContactResponse>;
    remove(payload: RemoveContactOptions): Promise<RemoveContactsResponse>;
  };
}

const MISSING_CONTACTS_KEY = 'RESEND_CONTACTS_API_KEY is not configured';

function loggingContactsClient(): ContactsClient {
  const note = (op: string, detail: string) =>
    log('info', `[contacts:log] ${op} ${detail}`, { action: 'contacts_log_mode', op });
  return {
    contacts: {
      async list() {
        return { data: { object: 'list', data: [], has_more: false }, error: null, headers: null };
      },
      async create(payload) {
        note('create', maskEmail(payload.email));
        return { data: { object: 'contact', id: `log-${Date.now().toString(36)}` }, error: null, headers: null };
      },
      async update(payload) {
        const id = 'id' in payload && payload.id ? payload.id : 'by-email';
        note('update', `${id} unsubscribed=${String(payload.unsubscribed)}`);
        return { data: { object: 'contact', id }, error: null, headers: null };
      },
      async remove(payload) {
        const id = typeof payload === 'string' ? payload : 'id' in payload && payload.id ? payload.id : 'by-email';
        note('remove', id);
        return { data: { object: 'contact', deleted: true, contact: id }, error: null, headers: null };
      },
    },
  };
}

/** Live mode with no RESEND_CONTACTS_API_KEY throws. Log mode needs no key. */
export function getResendContactsClient(): ContactsClient {
  if (emailMode() === 'log') return loggingContactsClient();
  const key = process.env.RESEND_CONTACTS_API_KEY;
  if (!key) throw new Error(MISSING_CONTACTS_KEY);
  return new Resend(key);
}
