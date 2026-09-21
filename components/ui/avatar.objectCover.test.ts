/**
 * The Avatar primitive must crop, not stretch.
 *
 * `AvatarImage` renders an <img> with `aspect-square h-full w-full`. A square
 * box plus no `object-fit` means the browser default applies, and that default
 * is `fill` -- which STRETCHES the source to the box instead of cropping it.
 * Every non-square upload, which is most phone photos, rendered squashed.
 *
 * WHY THIS WENT UNSEEN FOR SO LONG. Of 29 <AvatarImage> usages across 26
 * files, exactly ONE passed `object-cover` itself: app/profile/edit/page.tsx,
 * the screen where you edit your own profile. So the only place an avatar
 * rendered correctly was the only place its owner looked at it closely. The
 * person best placed to notice their photo was wrong was the one person who
 * could not see it.
 *
 * SOURCE assertion rather than a render assertion, deliberately: jsdom has no
 * layout engine and computes no `object-fit`, so a rendered test here would
 * pass whether or not the class is present. That is the vacuous-check shape
 * this repo has been removing all week, and it would be especially misleading
 * on the one guard standing between a one-line regression and every avatar in
 * the product.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PRIMITIVE = readFileSync(join(ROOT, 'components/ui/avatar.tsx'), 'utf8');

/** Source with comments stripped, so the prose above cannot satisfy a check. */
const CODE = PRIMITIVE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', '.claude', 'scripts'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(e) && !e.includes('.test.')) acc.push(p);
  }
  return acc;
}

describe('Avatar primitive crops rather than stretches', () => {
  it('AvatarImage carries object-cover', () => {
    // Matched across newlines: prettier splits the tag over several lines, and
    // the first version of this test searched for `AvatarPrimitive.Image ref`
    // on one line, found nothing, and failed against correct source. An
    // extractor that cannot see the thing it checks reports the wrong answer
    // with total confidence -- the recurring shape in this repo.
    const tag = CODE.match(/<AvatarPrimitive\.Image[\s\S]*?\/>/);
    expect(tag, 'could not find the AvatarPrimitive.Image tag at all').not.toBeNull();
    expect(
      tag![0],
      'AvatarImage lost object-cover. Without it the <img> defaults to ' +
        'object-fit: fill and every non-square avatar in the product is ' +
        'stretched, on 28 surfaces at once.'
    ).toContain('object-cover');
  });

  it('still forces a square box, so removing the stretch did not change the shape', () => {
    expect(CODE).toContain('aspect-square');
  });

  it('no call site re-adds object-cover, so the primitive stays the only place it lives', () => {
    const offenders: string[] = [];
    for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))]) {
      if (file.endsWith('components/ui/avatar.tsx')) continue;
      const src = readFileSync(file, 'utf8');
      // Only <AvatarImage ...> tags, not every object-cover in the file.
      for (const m of src.matchAll(/<AvatarImage\b[^>]*>/g)) {
        if (m[0].includes('object-cover')) offenders.push(`${file.replace(ROOT + '/', '')}  ${m[0].slice(0, 90)}`);
      }
    }
    expect(
      offenders,
      `These call sites pass object-cover to <AvatarImage>, which the primitive ` +
        `now sets:\n\n  ${offenders.join('\n  ')}\n\nOne local copy is how this ` +
        `defect survived: the fix existed in exactly one file and nowhere else, ` +
        `so the bug looked fixed to whoever wrote it.\n`
    ).toEqual([]);
  });
});
