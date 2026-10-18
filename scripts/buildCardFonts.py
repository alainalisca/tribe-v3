#!/usr/bin/env python3
"""
Build the three static fonts lib/og/card.tsx draws every share card with
(T-SHARE1 Part A): Big Shoulders 900 for the headline, JetBrains Mono 500 for
the sub lines and captions, JetBrains Mono 700 for the tag.

Same reason and same method as scripts/buildOgFonts.py, read its docstring:
Google ships both families as variable fonts only, Satori (next/og) ignores a
variable font's weight axis and silently draws the default, so each weight is
pinned with fontTools' instancer and subset to the characters a card can draw.
The output is checked in.

Big Shoulders has a second axis, opsz (10 to 72). The site's headline is the
Display cut, which is opsz 72; it is pinned there too, or the card would draw
the narrower text cut the site never shows.

RUNNING IT (throwaway venv, as for buildOgFonts.py):

    python3 -m venv /tmp/fontvenv
    /tmp/fontvenv/bin/pip install 'fonttools[woff]'
    /tmp/fontvenv/bin/python scripts/buildCardFonts.py \\
        path/to/BigShoulders[opsz,wght].ttf path/to/JetBrainsMono[wght].ttf

Sources: the upstream variable fonts at
https://github.com/google/fonts/tree/main/ofl/bigshoulders and
https://github.com/google/fonts/tree/main/ofl/jetbrainsmono (both SIL OFL 1.1;
the licence texts sit next to the output in public/fonts/).
"""

import pathlib
import sys

from buildOgFonts import CHARS, assert_is_font

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools.subset import Options, Subsetter
except ImportError:  # pragma: no cover - operator-facing guidance
    sys.exit("fontTools is not installed. See the module docstring.")

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "fonts"

# (source argument index, axis pins, output name). Keep in step with FONTS in
# lib/og/card.tsx: a weight the renderer asks for and this script does not cut
# resolves to the nearest one, silently.
CUTS = (
    (0, {"wght": 900, "opsz": 72}, "BigShoulders-Black.ttf"),
    (1, {"wght": 500}, "JetBrainsMono-Medium.ttf"),
    (1, {"wght": 700}, "JetBrainsMono-Bold.ttf"),
)


def cut(src: pathlib.Path, pins: dict, name: str) -> None:
    assert_is_font(src)
    font = TTFont(src)
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
    for tag, value in pins.items():
        lo, hi = axes[tag]
        if not lo <= value <= hi:
            sys.exit(f"{tag} {value} is outside {src.name}'s range {lo}..{hi}.")
    if set(axes) - set(pins):
        sys.exit(f"{src.name} has unpinned axes {sorted(set(axes) - set(pins))}.")
    static = instancer.instantiateVariableFont(font, pins, inplace=True)

    opts = Options()
    opts.layout_features = ["kern", "liga", "calt"]
    opts.notdef_outline = True
    opts.recalc_bounds = True
    subsetter = Subsetter(options=opts)
    subsetter.populate(text=CHARS)
    subsetter.subset(static)

    static.flavor = None
    dest = OUT_DIR / name
    static.save(dest)
    static.close()

    assert_is_font(dest)
    check = TTFont(dest)
    if "fvar" in check or "gvar" in check:
        sys.exit(f"{dest} still carries fvar/gvar: instancing did not take.")
    if check["OS/2"].usWeightClass != pins["wght"]:
        sys.exit(f"{dest} reports usWeightClass {check['OS/2'].usWeightClass}, expected {pins['wght']}.")
    check.close()
    print(f"  {name:28s} {dest.stat().st_size:>7,} bytes  {pins}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} <BigShoulders[opsz,wght].ttf> <JetBrainsMono[wght].ttf>")
    sources = [pathlib.Path(a).expanduser() for a in sys.argv[1:]]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for index, pins, name in CUTS:
        cut(sources[index], pins, name)
