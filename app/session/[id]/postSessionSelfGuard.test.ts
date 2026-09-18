import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * T-AUD12. The ticket said an instructor sees a Follow button on their own
 * storefront. That does not reproduce -- every follow surface is self-guarded.
 * The real instance of the same defect is on the session page: PostSessionFlow
 * asks the viewer to RATE THE HOST, and its call site had no `!isCreator`,
 * three lines below a SubscribeButton that does.
 *
 * NOT HYPOTHETICAL. Production holds one review row where reviewer_id equals
 * host_id -- a 5-star self-rating on session
 * 21a301f1-3c77-4551-a527-00d38943362e, which is one of the 23 sessions
 * migration 169 cleaned up. That is the mechanism end to end: the host had a
 * session_participants row, so `hasJoined` was true, so the flow opened for
 * them.
 *
 * WHY THIS IS A SOURCE ASSERTION AND NOT A RENDER TEST. The hole is in a JSX
 * guard expression at a call site, and the component renders behind a modal
 * gated on async session state. A render test would need the whole
 * useSessionDetail surface mocked and would still be asserting on the
 * component rather than on what the page hands it -- the wrong layer for this
 * defect, in the shape already recorded in CLAUDE.md.
 *
 * It also pins the SubscribeButton guard next to it, because the two are the
 * same rule and having one without the other is exactly how this happened.
 */
const PAGE = path.join(__dirname, 'page.tsx');

function source(): string {
  return fs.readFileSync(PAGE, 'utf-8');
}

/** The JSX condition immediately preceding a component's opening tag. */
function guardBefore(component: string): string {
  const src = source();
  const at = src.indexOf(`<${component}`);
  expect(at, `${component} is no longer rendered from the session page`).toBeGreaterThan(-1);
  const open = src.lastIndexOf('{', at);
  return src.slice(open, at);
}

describe('the session page never offers a host an action aimed at the host', () => {
  it('PostSessionFlow is gated on !isCreator, so a host is not asked to rate themselves', () => {
    const guard = guardBefore('PostSessionFlow');
    expect(
      /!\s*isCreator/.test(guard),
      `PostSessionFlow renders under \`${guard.trim()}\`, which does not exclude the host. ` +
        `This flow asks the viewer to rate the host; without !isCreator the host rates themselves, ` +
        `and production already holds one such row from before migration 169.`
    ).toBe(true);
  });

  it('SubscribeButton keeps its !isCreator guard, since the two are the same rule', () => {
    const guard = guardBefore('SubscribeButton');
    expect(/!\s*isCreator/.test(guard), `SubscribeButton renders under \`${guard.trim()}\``).toBe(true);
  });

  it('the guard does not rely on hasJoined, which a data migration happens to make false for hosts', () => {
    // hasJoined is computed from session_participants rows alone. It is false
    // for hosts only because 169 deleted every host's row, so anything that
    // recreates one reopens this. A display rule must not depend on that.
    const guard = guardBefore('PostSessionFlow');
    expect(
      /hasJoined/.test(guard) && !/!\s*isCreator/.test(guard),
      'the host exclusion must be explicit, not inherited from hasJoined'
    ).toBe(false);
  });
});
