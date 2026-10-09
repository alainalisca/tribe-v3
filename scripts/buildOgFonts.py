#!/usr/bin/env python3
"""
Build the three static Plus Jakarta Sans weights that app/api/og/route.tsx
embeds in every share card.

WHY THIS SCRIPT EXISTS AT ALL
-----------------------------
Google ships Plus Jakarta Sans as a VARIABLE font only -- `PlusJakartaSans[wght].ttf`,
one file with a `wght` axis from 200 to 800. There are no static TTFs upstream;
the per-weight files the CSS API serves are woff2, which Satori cannot read.

Satori (the renderer behind next/og) reads a variable font's `fvar` table -- the
axis DEFINITIONS -- but has no `gvar` support, which is the table that actually
MORPHS glyph outlines to a requested weight. Measured on this repo's bundled
copy of the renderer:

    $ grep -o fvar node_modules/next/dist/compiled/@vercel/og/index.node.js | wc -l
    10
    $ grep -o gvar node_modules/next/dist/compiled/@vercel/og/index.node.js | wc -l
    0

So handing Satori the variable file and asking for weight 800 draws the 400
default. SILENTLY -- no warning, no error, just a card where the headline, the
body and the caption are all the same weight and the design has quietly
flattened. That is the failure mode this script exists to prevent, and it is
the reason the output is checked in rather than generated at build time: a
build step that can be skipped is a build step that will be.

WHAT IT PRODUCES
----------------
Three real static instances, each subset to the characters a share card can
draw, written to app/api/og/fonts/:

    PlusJakartaSans-Medium.ttf      wght 500   ~16.7 KB
    PlusJakartaSans-Bold.ttf        wght 700   ~16.7 KB
    PlusJakartaSans-ExtraBold.ttf   wght 800   ~16.7 KB

50 KB for three working weights, against 176 KB for one that does not work.

RUNNING IT
----------
Needs fontTools, which is not an npm dependency and deliberately not added to
this repo -- it is run by hand when the font or the character set changes, not
on every install. Use a throwaway virtualenv (system pip is PEP 668 managed on
macOS and will refuse):

    python3 -m venv /tmp/fontvenv
    /tmp/fontvenv/bin/pip install 'fonttools[woff]'
    /tmp/fontvenv/bin/python scripts/buildOgFonts.py path/to/PlusJakartaSans[wght].ttf

The source file is the genuine upstream variable font from
https://github.com/google/fonts/tree/main/ofl/plusjakartasans
(`PlusJakartaSans[wght].ttf`, 176,288 bytes). VERIFY THE SOURCE IS A FONT
before trusting it: the copies that arrived with the T-GROW3b mockups had the
right names and extensions and were a saved HTML error page -- header bytes
`0a0a0a0a` followed by `<!DOCTYPE html>`. This script checks the sfnt version
of its input for that reason, and checks it again on every output.

THE OUTPUT IS NOT BYTE-REPRODUCIBLE, AND THAT IS EXPECTED
---------------------------------------------------------
fontTools stamps `head.modified` with the current time on every save, so two
runs seconds apart produce files of identical length that differ in those
eight bytes (and the two checksums over them). Measured: two runs inside the
same second are byte-identical and no table other than `head` ever differs.
So a `git diff` after re-running this script is NOT evidence the fonts
changed -- compare table checksums, or just the file sizes, before believing
anything moved.

IF A CHARACTER IS MISSING FROM A CARD
-------------------------------------
Add it to CHARS and re-run. A character outside the subset falls back to the
renderer's default face for that glyph -- so the card still renders, it just
renders that one letter in the wrong typeface, which on an accented Spanish
word is subtle enough to ship unnoticed. That is why the Spanish diacritics
are enumerated explicitly below rather than left to a "Latin" range that may
or may not include them.
"""

import pathlib
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools.subset import Options, Subsetter
except ImportError:  # pragma: no cover - operator-facing guidance
    sys.exit(
        "fontTools is not installed. See the module docstring: create a venv and\n"
        "    pip install 'fonttools[woff]'"
    )

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "app" / "api" / "og" / "fonts"

# The weights app/api/og/route.tsx declares to Satori. Keep the two in step:
# a weight the route asks for and this script does not cut resolves to the
# NEAREST declared weight, which is a silent downgrade, not an error.
WEIGHTS = ((500, "Medium"), (700, "Bold"), (800, "ExtraBold"))

# Every character a card can draw. Latin, the Spanish diacritics the copy needs
# (Medellin -> Medellín, Rio -> Río, Mie -> Miércoles, Sabado -> Sábado), the
# punctuation the layouts use including the middot separator, and digits for
# dates and prices. Deliberately NOT the whole Latin-1 range: every glyph kept
# is bytes in an edge bundle.
CHARS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " .,:;!?¿¡()[]{}@#%&*+-–—_/\\|<>\"'`^~=$"
    "·•°"
    "áéíóúÁÉÍÓÚ"  # acute -- the common case in Spanish
    "ñÑüÜ"  # eñe and diaeresis
    "ÀÈÌÒÙàèìòù"  # grave, for names that carry it
    "ÂÊÎÔÛâêîôû"  # circumflex, likewise
    "ÇçªºÅåÄäÖöØø"  # names from elsewhere in the roster
)

SFNT_TRUETYPE = b"\x00\x01\x00\x00"


def assert_is_font(path: pathlib.Path) -> None:
    """Fail loudly on a file that is not a TrueType font.

    This is not defensive padding. The PJS 'static weights' that arrived with
    the mockups were named PJS-Bold.ttf and were an HTML error page; nothing
    about the filename, the extension or the byte count gave it away, and a
    non-font reaches Satori as a render-time exception on a surface nobody
    watches.
    """
    head = path.read_bytes()[:4]
    if head != SFNT_TRUETYPE:
        sys.exit(
            f"{path} is not a TrueType font: first four bytes are {head.hex()}, "
            f"expected {SFNT_TRUETYPE.hex()}. If it starts with 0a0a0a0a or 3c21, "
            f"it is almost certainly a saved HTML error page from a failed download."
        )


def build(src: pathlib.Path) -> None:
    assert_is_font(src)
    probe = TTFont(src)
    if "fvar" not in probe:
        sys.exit(f"{src} has no fvar table -- it is not a variable font, so there is nothing to instance.")
    axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in probe["fvar"].axes}
    if "wght" not in axes:
        sys.exit(f"{src} has no wght axis; found {sorted(axes)}.")
    lo, _default, hi = axes["wght"]
    probe.close()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for weight, name in WEIGHTS:
        if not lo <= weight <= hi:
            sys.exit(f"wght {weight} is outside the source axis range {lo}..{hi}.")
        font = TTFont(src)
        # Pin the axis to one value: this produces real outlines at that weight,
        # which is the step Satori cannot do at render time.
        static = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=True)

        opts = Options()
        opts.layout_features = ["kern", "liga", "calt"]  # kerning is visible at 96px
        opts.notdef_outline = True
        opts.recalc_bounds = True
        subsetter = Subsetter(options=opts)
        subsetter.populate(text=CHARS)
        subsetter.subset(static)

        static.flavor = None  # plain TTF; Satori cannot read woff2
        dest = OUT_DIR / f"PlusJakartaSans-{name}.ttf"
        static.save(dest)
        static.close()

        # Prove the output is a font and is no longer variable. A residual fvar
        # means Satori would read it as variable and ignore the weight -- the
        # exact defect this script exists to avoid, reintroduced by the fix.
        assert_is_font(dest)
        check = TTFont(dest)
        if "fvar" in check or "gvar" in check:
            sys.exit(f"{dest} still carries fvar/gvar -- instancing did not take.")
        if check["OS/2"].usWeightClass != weight:
            sys.exit(f"{dest} reports usWeightClass {check['OS/2'].usWeightClass}, expected {weight}.")
        check.close()
        print(f"  {dest.name:32s} {dest.stat().st_size:>7,} bytes  (wght {weight})")

    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.ttf"))
    print(f"\n  total: {total:,} bytes in {OUT_DIR.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(f"usage: {sys.argv[0]} <path to PlusJakartaSans[wght].ttf>")
    build(pathlib.Path(sys.argv[1]).expanduser())
