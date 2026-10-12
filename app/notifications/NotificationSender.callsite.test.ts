/**
 * The notifications PAGE must delegate the sender slot to NotificationSender.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A SOURCE TEST AND NOT ANOTHER COMPONENT TEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NotificationSender.test.tsx mounts the component with props it supplies
 * itself. It can see everything the component DOES and nothing about how it is
 * CALLED. The S3 UI defect lived in one JSX expression at the call site --
 * `actor?.avatar_url ? <img> : TYPE_ICONS[type]` -- so restoring that
 * expression leaves every component test green while the page renders the
 * system icon for any user without a photo.
 *
 * CLAUDE.md records this exact shape costing fifteen passing tests: the
 * storefront editor copied the wrong bio column, the bug was one prop
 * expression at the call site, and the whole behaviour suite stayed green with
 * it fully restored. When a defect lives in how a component is called, assert
 * on the CALL SITE, in source.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND THE CHEAP DISHONEST FIX IS TAKEN AWAY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The obvious way to satisfy case 1 without fixing anything is to keep
 * rendering the ternary and ALSO mount <NotificationSender> somewhere, so both
 * appear. Case 2 forbids the ternary outright, and case 3 forbids the page
 * from importing TYPE_ICONS at all -- the page has no legitimate use for it
 * now that the component owns the system-icon branch, so an import is the
 * earliest observable sign it is drifting back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/notifications/page.tsx'), 'utf8');

/** Comments are part of the corpus until something strips them. This repo has
 *  four recorded cases of a check matching prose that describes the thing it
 *  checks -- including one whose own migration header fed it a column named
 *  `so`. Strip line and block comments before matching. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('notifications page call site', () => {
  const body = code(page);

  it('renders the sender through NotificationSender', () => {
    expect(body).toContain('<NotificationSender');
  });

  it('never falls back from a missing avatar to a type icon', () => {
    // The defect, in any spacing: actor(.|?.)avatar_url ... ? ... TYPE_ICONS
    const oldFallback = /actor\??\.avatar_url[\s\S]{0,120}\?[\s\S]{0,200}TYPE_ICONS/;
    expect(oldFallback.test(body)).toBe(false);
  });

  it('does not import TYPE_ICONS at all -- the component owns that branch', () => {
    expect(body).not.toMatch(/TYPE_ICONS/);
  });

  it('passes the notification and a resolved sender label to the component', () => {
    const tag = body.match(/<NotificationSender[\s\S]{0,200}?\/>/);
    expect(tag).not.toBeNull();
    expect(tag![0]).toMatch(/notification=\{/);
    expect(tag![0]).toMatch(/unknownSenderLabel=\{/);
  });
});
