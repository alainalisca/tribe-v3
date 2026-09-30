/**
 * T-AV22: the seed's shape is what the pre-written expected ledger depends on.
 *
 * The ledger itself can only be checked against a database (the proof script,
 * supabase/recon/t-av22-proof.LOCAL.sh). What CAN be checked here, with no
 * database, is that every lead the expected table was derived from still says
 * what the derivation assumed. An edit to LEADS that quietly turned C9 into a
 * normal guest would otherwise surface only as a ledger mismatch, with nothing
 * saying which assumption broke.
 *
 * Also: every value the database would refuse on insert (pass code shape,
 * E.164, ref code shape) is refused here first, where the message is better.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ATHLETES, EXTRA_PEOPLE, LEADS } from './av-seed-athletes.mjs';

type Lead = (typeof LEADS)[number];
const lead = (key: string): Lead => {
  const found = LEADS.find((l: Lead) => l.key === key);
  if (!found) throw new Error(`no seed lead ${key}`);
  return found;
};
const athlete = (key: string) => {
  const found = ATHLETES.find((a) => a.key === key);
  if (!found) throw new Error(`no seed athlete ${key}`);
  return found;
};
const of = (key: string) => LEADS.filter((l: Lead) => l.athlete === key);

describe('seed values the database would refuse', () => {
  it('every pass code matches pass_leads_pass_code and is unique', () => {
    const codes = LEADS.map((l: Lead) => l.code);
    for (const c of codes) expect(c).toMatch(/^[A-Z]{2}-[A-Z2-9]{4}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every WhatsApp is E.164, leads and athletes alike', () => {
    for (const l of LEADS) expect(l.whatsapp).toMatch(/^\+[1-9][0-9]{7,14}$/);
    for (const a of ATHLETES) expect(a.whatsapp).toMatch(/^\+[1-9][0-9]{7,14}$/);
  });

  it('every ref code matches program_athletes_ref_code_check and is unique', () => {
    for (const a of ATHLETES) expect(a.refCode).toMatch(/^[A-Z0-9-]{4,24}$/);
    expect(new Set(ATHLETES.map((a) => a.refCode)).size).toBe(ATHLETES.length);
  });

  it('has 33 leads: 12 state leads for Caro, 9 for Ana, 10 for Beto, P0 and one on the other partner', () => {
    expect(LEADS).toHaveLength(33);
    expect(of('caro')).toHaveLength(12);
    expect(of('ana')).toHaveLength(9);
    expect(of('beto')).toHaveLength(10);
    expect(LEADS.filter((l: Lead) => l.partner === 'B')).toHaveLength(1);
  });

  it('seeds exactly one admin', () => {
    expect(EXTRA_PEOPLE.filter((p) => p.isAdmin)).toHaveLength(1);
  });
});

describe('the assumptions behind the expected ledger', () => {
  it('Ana: nine attended leads, no outcome, so 9 show-ups and one short of Ready', () => {
    expect(of('ana').every((l: Lead) => l.attended !== undefined && !l.outcome)).toBe(true);
    expect(athlete('ana').level).toBe('captain');
  });

  it('Beto: ten attended leads, exactly one joined, and that join is not bonus eligible', () => {
    expect(of('beto').every((l: Lead) => l.attended !== undefined)).toBe(true);
    const joins = of('beto').filter((l: Lead) => l.outcome === 'joined');
    expect(joins.map((l: Lead) => l.key)).toEqual(['B10']);
    expect(joins[0].bonusEligible).toBe(false);
    expect(athlete('beto').level).toBe('captain');
  });

  it('Caro is at athlete level and every one of her joins is bonus eligible', () => {
    expect(athlete('caro').level).toBe('athlete');
    const joins = of('caro').filter((l: Lead) => l.outcome === 'joined');
    expect(joins.map((l: Lead) => l.key)).toEqual(['C3', 'C4', 'C5']);
    expect(joins.every((l: Lead) => l.bonusEligible === true && l.attended !== undefined)).toBe(true);
  });

  it('C3 is joined inside retention_days (30), C4 is retained, C5 is settled', () => {
    expect(lead('C3').outcomeAt).toBeGreaterThan(-30);
    expect(lead('C3').retained).toBeUndefined();
    expect(lead('C4').retained).toBeDefined();
    expect(lead('C5').settled).toBeDefined();
    expect(lead('C4').settled).toBeUndefined();
  });

  it('C8 is already_member, C9 self by email, C10 self by WhatsApp', () => {
    expect(lead('C8').outcome).toBe('already_member');
    expect(lead('C9').email.toLowerCase()).toBe(athlete('caro').email);
    expect(lead('C9').whatsapp).not.toBe(athlete('caro').whatsapp);
    expect(lead('C10').whatsapp).toBe(athlete('caro').whatsapp);
    expect(lead('C10').email).not.toBe(athlete('caro').email);
  });

  it('C11 is returning: P0 has the same email, was created earlier, and attended', () => {
    expect(lead('C11').email).toBe(lead('P0').email);
    expect(lead('P0').created).toBeLessThan(lead('C11').created);
    expect(lead('P0').attended).toBeDefined();
    expect(lead('P0').athlete).toBeNull();
  });

  it('C12 is a duplicate of C1: same email, neither attended, C1 earlier', () => {
    expect(lead('C12').email).toBe(lead('C1').email);
    expect(lead('C12').whatsapp).not.toBe(lead('C1').whatsapp);
    expect(lead('C1').attended).toBeUndefined();
    expect(lead('C12').attended).toBeUndefined();
    expect(lead('C1').created).toBeLessThan(lead('C12').created);
  });

  it('no two Ana or Beto guests share an email or a WhatsApp, so none of them is a duplicate', () => {
    for (const key of ['ana', 'beto']) {
      const leads = of(key);
      expect(new Set(leads.map((l: Lead) => l.email)).size).toBe(leads.length);
      expect(new Set(leads.map((l: Lead) => l.whatsapp)).size).toBe(leads.length);
    }
  });
});

describe('the production seed is out of reach', () => {
  it('the athlete seed never names scripts/seed-bullbox.sql except to say it must not', () => {
    const src = readFileSync('scripts/av-seed-athletes.mjs', 'utf8');
    const mentions = src.split('\n').filter((line) => line.includes('seed-bullbox.sql'));
    expect(mentions).toEqual([' * NEVER scripts/seed-bullbox.sql. That file seeds the real BullBox in']);
  });
});
