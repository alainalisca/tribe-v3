/**
 * The admin Origen tab's "Referidos" section (T-GROW2 C and D). Pure.
 *
 * One row per code that brought anyone in: who owns it, how many pass leads it
 * brought, how many of those attended, and how many accounts signed up with it.
 * Rewards are NOT computed here and not shown: they are decided and fulfilled by
 * the partner, and the reward itself is unconfirmed (spec C).
 *
 * TWO CODE NAMESPACES, told apart by who owns them, not by shape:
 *   user  TRIBE-XXXXX, a referrals code row (getOrCreateReferralCode)
 *   lead  six characters, pass_leads.lead_ref_code (migration 215)
 * A code nobody owns is still a row ("unknown"): someone typed or printed it,
 * and hiding it would hide a broken link.
 *
 * THE SELF-REFERRAL GUARD (spec D): a referred lead or signup whose normalised
 * phone or lowercased email matches the code owner's is NOT counted. It is not
 * hidden either: `selfExcluded` shows how many were set aside, so a referrer
 * gaming their own count is visible rather than silently absorbed. The lead
 * itself is never blocked; this only decides what counts.
 */
import { normalizeWhatsApp } from '@/lib/pase/phone';

export interface CodeOwner {
  code: string;
  kind: 'user' | 'lead';
  label: string;
  email: string | null;
  phone: string | null;
}

export interface ReferredPerson {
  ref: string;
  email: string | null;
  phone: string | null;
}

export interface ReferredLead extends ReferredPerson {
  attended: boolean;
}

export interface ReferralRow {
  code: string;
  kind: 'user' | 'lead' | 'unknown';
  referrer: string | null;
  leads: number;
  attended: number;
  signups: number;
  selfExcluded: number;
}

function sameEmail(a: string | null, b: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function samePhone(a: string | null, b: string | null): boolean {
  const na = normalizeWhatsApp(a);
  return !!na && na === normalizeWhatsApp(b);
}

export function isSelfReferral(owner: CodeOwner | undefined, person: ReferredPerson): boolean {
  if (!owner) return false;
  return sameEmail(owner.email, person.email) || samePhone(owner.phone, person.phone);
}

export function summarizeReferrals(
  owners: CodeOwner[],
  leads: ReferredLead[],
  signups: ReferredPerson[]
): ReferralRow[] {
  // Codes are compared uppercase, the casing lib/attribution stores `ref` in.
  const byCode = new Map(owners.map((o) => [o.code.toUpperCase(), o]));
  const rows = new Map<string, ReferralRow>();

  const rowFor = (ref: string): ReferralRow => {
    const code = ref.toUpperCase();
    let row = rows.get(code);
    if (!row) {
      const owner = byCode.get(code);
      row = {
        code,
        kind: owner ? owner.kind : 'unknown',
        referrer: owner ? owner.label : null,
        leads: 0,
        attended: 0,
        signups: 0,
        selfExcluded: 0,
      };
      rows.set(code, row);
    }
    return row;
  };

  for (const lead of leads) {
    const row = rowFor(lead.ref);
    if (isSelfReferral(byCode.get(row.code), lead)) {
      row.selfExcluded += 1;
      continue;
    }
    row.leads += 1;
    if (lead.attended) row.attended += 1;
  }
  for (const signup of signups) {
    const row = rowFor(signup.ref);
    if (isSelfReferral(byCode.get(row.code), signup)) {
      row.selfExcluded += 1;
      continue;
    }
    row.signups += 1;
  }

  return [...rows.values()].sort(
    (a, b) => b.leads - a.leads || b.signups - a.signups || a.code.localeCompare(b.code)
  );
}
