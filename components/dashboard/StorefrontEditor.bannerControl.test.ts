/**
 * T-AUD14: the banner upload control must not live inside the preview box.
 *
 * THE DEFECT WAS ARITHMETIC, NOT APPEARANCE. The control was
 * `absolute bottom-3 right-3` inside a `relative h-40` box that also held a
 * vertically centred text column. Both positions are width-independent, so the
 * overlap was too:
 *
 *   box height                                    160px  (h-40)
 *   column content  40 + 4 + 4 + 20 + 4 + 16  =    88px
 *   free space at each end   (160 - 88) / 2   =    36px
 *   control needs   bottom-3 + its own height =    48px  (12 + 36)
 *                                                 -----
 *   overlap                                        12px of the hint's 16px
 *
 * Horizontally they met on anything under roughly 620px, so every phone. The
 * instructor never saw "1200x400 recommended", which is the one thing the box
 * exists to tell them.
 *
 * IT WAS REPORTED AS NOT REPRODUCING. The first read described the layout --
 * "button corner-anchored, hint centred in a flex column" -- and concluded
 * separation from the description without computing the intersection. Both
 * descriptions are true of two elements that overlap.
 *
 * THE RULE THIS ENCODES, which is why the fix moves the control rather than
 * padding the column: an absolutely positioned control inside a fixed-height
 * box that centres content is safe only while
 *
 *   offset + control height  <=  (box height - content height) / 2
 *
 * and nothing in the source states that inequality or checks it. Padding the
 * column would have kept the dependency and fixed one instance. Moving the
 * control out removes the dependency.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = fs.readFileSync(path.join(__dirname, 'StorefrontEditor.tsx'), 'utf8');

/** The source with comments removed, so the explanation above cannot satisfy a check. */
const CODE = SRC.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('T-AUD14 banner upload control', () => {
  it('is not positioned absolutely inside the preview box', () => {
    expect(CODE).not.toMatch(/absolute\s+bottom-3\s+right-3/);
  });

  it('sits after the preview box closes, not within it', () => {
    // Line-and-indentation based, not a tag walk. A tag walk over JSX has to
    // understand self-closing tags, `{...}` expressions and conditional
    // fragments, and the first version of this test got it wrong and failed on
    // correct source -- which is the same class of instrument bug as the rest
    // of this repo's guards. Indentation is stable here because prettier runs
    // in pre-commit, and it answers the only question that matters: does the
    // preview element close before the control opens?
    const lines = CODE.split('\n');
    const previewLine = lines.findIndex((l) => l.includes('relative h-40'));
    expect(previewLine).toBeGreaterThan(-1);

    const indent = (l: string) => l.length - l.trimStart().length;
    const previewIndent = indent(lines[previewLine]);

    // The first closing tag at the preview's own indentation closes it.
    let closeLine = -1;
    for (let i = previewLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '</div>' && indent(lines[i]) === previewIndent) {
        closeLine = i;
        break;
      }
    }
    expect(closeLine, 'could not find where the preview box closes').toBeGreaterThan(previewLine);

    const controlLine = lines.findIndex((l) => l.includes('onChange={handleBannerUpload}'));
    expect(controlLine).toBeGreaterThan(-1);
    expect(
      controlLine,
      'The upload control is inside the preview box again. It must be a sibling ' +
        'after it: inside, its clearance depends on (box height - content) / 2, ' +
        'which nothing states and nothing checks.'
    ).toBeGreaterThan(closeLine);
  });

  it('still renders the hint the overlap used to hide', () => {
    expect(CODE).toContain('bannerHint');
    expect(SRC).toContain('1200×400 recommended');
  });
});
