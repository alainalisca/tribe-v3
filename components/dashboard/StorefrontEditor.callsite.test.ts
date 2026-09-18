/**
 * Issue 2, the survivor guard.
 *
 * The StorefrontEditor tests mount the component with props, so they cannot
 * see what the dashboard PASSES it. A mutation restoring the old prefill --
 * `initialBio={profile.instructor_bio || profile.bio || ''}` -- left all
 * fifteen of them green. That prop expression IS the divergence mechanism:
 * with instructor_bio empty it puts users.bio in the box, and the next save
 * writes it into users.instructor_bio, leaving users.bio stale while
 * /profile/[userId] and /search still display it.
 *
 * The defect lives in a one-line prop expression at a call site, so the
 * instrument that can see it is a source assertion. Same shape as
 * lib/sports.singleSource.test.ts: the behaviour tests cover what the
 * component does, this covers what it is handed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DASHBOARD = path.join(__dirname, '..', '..', 'app', 'dashboard', 'instructor', 'page.tsx');

function source(): string {
  return fs.readFileSync(DASHBOARD, 'utf-8');
}

/** The props passed to <StorefrontEditor ... />, as written. */
function storefrontEditorProps(): string {
  const src = source();
  const open = src.indexOf('<StorefrontEditor');
  expect(open, 'the instructor dashboard no longer renders <StorefrontEditor>').toBeGreaterThan(-1);
  const close = src.indexOf('/>', open);
  expect(close, '<StorefrontEditor> has no self-closing tag').toBeGreaterThan(open);
  return src.slice(open, close);
}

describe('the instructor dashboard hands StorefrontEditor one column per prop', () => {
  it('initialBio comes from instructor_bio alone, never falling back to bio', () => {
    const props = storefrontEditorProps();
    const match = props.match(/initialBio=\{([^}]*)\}/);
    expect(match, 'initialBio is not passed at all').not.toBeNull();

    const expr = match![1];
    expect(
      /\bbio\b/.test(expr.replace(/instructor_bio/g, '')),
      `initialBio reads users.bio: \`${expr.trim()}\`. That prefill is the divergence mechanism -- ` +
        `with instructor_bio empty it loads users.bio into the storefront box, and the next save ` +
        `copies it into instructor_bio while /profile and /search still show the stale users.bio. ` +
        `Pass instructor_bio alone and let initialShortBio explain the display fallback.`
    ).toBe(false);
    expect(expr).toContain('instructor_bio');
  });

  it('initialShortBio is passed, so the fallback can be explained rather than prefilled', () => {
    const props = storefrontEditorProps();
    const match = props.match(/initialShortBio=\{([^}]*)\}/);
    expect(match, 'initialShortBio is not passed, so the empty state cannot explain itself').not.toBeNull();
    expect(match![1]).toMatch(/\bprofile\.bio\b/);
  });

  it('the two bio props do not read the same column', () => {
    // A guard against "fixing" this by passing instructor_bio to both, which
    // would silence the first test while leaving the note permanently wrong.
    const props = storefrontEditorProps();
    const bioExpr = props.match(/initialBio=\{([^}]*)\}/)?.[1] ?? '';
    const shortExpr = props.match(/initialShortBio=\{([^}]*)\}/)?.[1] ?? '';
    expect(bioExpr.trim()).not.toBe(shortExpr.trim());
  });
});
