/**
 * T-AV29 (P1-2). WHERE the contact button is mounted, and with which source
 * and guard, is a property of the call sites, which the component tests cannot
 * see (CLAUDE.md: a test at the wrong layer for the defect). Parsed from the
 * JSX of each page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

/** The props text of each <Name ... /> element, brace-depth aware (JSX handlers contain `=>`). */
function elementProps(src: string, name: string): string[] {
  const out: string[] = [];
  let at = src.indexOf(`<${name}`);
  while (at !== -1) {
    let i = at + name.length + 1;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      i++;
    }
    out.push(src.slice(at, i));
    at = src.indexOf(`<${name}`, i);
  }
  return out;
}

/** The 300 characters before an element: where its render guard lives. */
function guardBefore(src: string, name: string): string {
  const at = src.indexOf(`<${name}`);
  return src.slice(Math.max(0, at - 300), at);
}

describe('CoachContactButtons call sites', () => {
  it('the storefront mounts it once, as source "storefront", for independent instructors only', () => {
    const src = read('app/storefront/[id]/page.tsx');
    const els = elementProps(src, 'CoachContactButtons');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatch(/source="storefront"/);
    expect(els[0]).toMatch(/coachId=\{instructorId\}/);
    expect(guardBefore(src, 'CoachContactButtons')).toMatch(/!isOrganization\s*&&/);
  });

  it('session detail mounts it once, as source "session" with the session id, never for the host', () => {
    const src = read('app/session/[id]/page.tsx');
    const els = elementProps(src, 'CoachContactButtons');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatch(/source="session"/);
    expect(els[0]).toMatch(/sessionId=\{d\.session\.id\}/);
    expect(els[0]).toMatch(/coachId=\{d\.creator\.id\}/);
    expect(guardBefore(src, 'CoachContactButtons')).toMatch(/!isCreator/);
  });

  it('the instructor dashboard mounts the settings card for the signed-in instructor', () => {
    const els = elementProps(read('app/dashboard/instructor/page.tsx'), 'CoachContactSettings');
    expect(els).toHaveLength(1);
    expect(els[0]).toMatch(/coachId=\{profile\.id\}/);
  });
});
