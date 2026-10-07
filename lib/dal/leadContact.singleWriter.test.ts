/**
 * T-AV26 (spec D13): "Oferta enviada" reuses set_pass_lead_contacted. There is
 * ONE writer of pass_leads.contacted_at in this app, lib/dal/leadContact.ts,
 * and nothing the gym dashboard added writes pass_leads at all.
 *
 * Asked as a capability, not a name: comments are stripped with the
 * TypeScript scanner before matching (the dashboard's own files explain, in
 * prose, that they reuse this function), and the question is "who CALLS the
 * RPC" and "which T-AV26 file touches pass_leads", not "who mentions it".
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - GymGuests: call supabase.rpc('set_pass_lead_contacted', ...) directly
 *     -> "only leadContact.ts calls set_pass_lead_contacted"
 *   - athleteGymWrites: add `supabase.from('pass_leads').update(...)`
 *     -> "no T-AV26 module reads or writes pass_leads directly"
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const ROOT = path.resolve(__dirname, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const CALL = /\.rpc\(\s*['"`]set_pass_lead_contacted['"`]/;

describe('pass_leads.contacted_at has one writer', () => {
  it('only leadContact.ts calls set_pass_lead_contacted', () => {
    const callers = ['app', 'lib', 'components', 'hooks']
      .flatMap((d) => sources(path.join(ROOT, d)))
      .filter((f) => CALL.test(sourceWithoutComments(f)))
      .map((f) => path.relative(ROOT, f));
    expect(callers).toEqual(['lib/dal/leadContact.ts']);
  });

  it('no T-AV26 module reads or writes pass_leads directly', () => {
    const files = [
      ...sources(path.join(ROOT, 'app/atletas/gym')),
      ...sources(path.join(ROOT, 'app/api/atletas/gym')),
      path.join(ROOT, 'lib/dal/athleteGym.ts'),
      path.join(ROOT, 'lib/dal/athleteGymWrites.ts'),
    ];
    expect(files.length).toBeGreaterThan(5);
    const touching = files
      .filter((f) => /from\(\s*['"`]pass_leads['"`]\s*\)/.test(sourceWithoutComments(f)))
      .map((f) => path.relative(ROOT, f));
    expect(touching).toEqual([]);
  });
});
