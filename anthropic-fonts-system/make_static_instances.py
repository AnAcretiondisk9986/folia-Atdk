"""Instantiate the Anthropic variable fonts into static faces.

Windows names a *variable* font from its STAT table, so the axis values end up
inside the family name: the file says "Anthropic Serif" but the engine only ever
indexes "Anthropic Serif Display Light". A static instance has no fvar and no
STAT, so the name table is the only thing left to read and the family lands in
the engine exactly as written here.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = Path(
    r"C:\Users\AnAcretiondisk\Documents\Codex\2026-10-11\https-www-anthropic-com-https-www"
    r"\outputs\anthropic-fonts-system"
)
OUT = Path(r"E:\SearchPage\.font-probe\static-fonts")

# Text optical size (16) with a regular/semibold weight is what a UI reads at
# 12-16px; Display (48) would be wrong at that size.
OPSZ = 16

JOBS = [
    ("Anthropic Serif.ttf", "Anthropic Serif", "Regular", 400, False),
    ("Anthropic Serif.ttf", "Anthropic Serif", "Bold", 700, False),
    ("Anthropic Serif Italic.ttf", "Anthropic Serif", "Italic", 400, True),
    ("Anthropic Sans.ttf", "Anthropic Sans", "Regular", 400, False),
    ("Anthropic Sans.ttf", "Anthropic Sans", "Bold", 700, False),
    ("Anthropic Sans Italic.ttf", "Anthropic Sans", "Italic", 400, True),
    ("Anthropic Mono.ttf", "Anthropic Mono", "Regular", 400, False),
    ("Anthropic Mono.ttf", "Anthropic Mono", "Bold", 700, False),
    ("Anthropic Mono Italic.ttf", "Anthropic Mono", "Italic", 400, True),
]

VAR_TABLES = ("fvar", "gvar", "STAT", "HVAR", "VVAR", "MVAR", "avar", "cvar")


def rename(font, family, style, weight, italic):
    full = family if style == "Regular" else f"{family} {style}"
    postscript = f"{family.replace(' ', '')}-{style}"
    name = font["name"]
    name.names = [
        record
        for record in name.names
        # Family/style/full/PostScript plus the typographic pair; instance names
        # (257+) are gone with the axes but drop any straggler for cleanliness.
        if record.nameID not in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25) and record.nameID < 256
    ]
    for name_id, value in (
        (1, family),
        (2, style),
        (3, f"1.000;NONE;{postscript}"),
        (4, full),
        (6, postscript),
        (16, family),
        (17, style),
    ):
        name.setName(value, name_id, 3, 1, 0x0409)
        name.setName(value, name_id, 1, 0, 0)

    # fsSelection is exclusive: REGULAR may only be set when neither BOLD nor
    # ITALIC is, which is exactly what a naive "set regular" pass gets wrong for
    # the italic faces (fontTools rejects the combination on save).
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    selection = os2.fsSelection & 0x80  # keep USE_TYPO_METRICS
    if italic:
        selection |= 0x01
    if weight >= 700:
        selection |= 0x20
    if not italic and weight < 700:
        selection |= 0x40
    os2.fsSelection = selection

    head = font["head"]
    head.macStyle = (0x01 if weight >= 700 else 0) | (0x02 if italic else 0)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for source, family, style, weight, italic in JOBS:
        src = SRC / source
        if not src.exists():
            print(f"  MISSING {src}")
            continue
        font = TTFont(str(src))
        # Only pin the axes the face actually declares: Anthropic Mono has no
        # optical size axis at all, and asking for one is a hard error.
        declared = {axis.axisTag for axis in font["fvar"].axes} if "fvar" in font else set()
        axes = {}
        if "wght" in declared:
            axes["wght"] = weight
        if "opsz" in declared:
            axes["opsz"] = OPSZ
        static = (
            instancer.instantiateVariableFont(font, axes, inplace=False, updateFontNames=False, optimize=True)
            if axes
            else font
        )
        for tag in VAR_TABLES:
            if tag in static:
                del static[tag]
        rename(static, family, style, weight, italic)
        out = OUT / f"{family.replace(' ', '')}-{style}.ttf"
        static.save(str(out))
        print(f"  {out.name:<32} family={family} style={style} wght={weight} "
              f"axes={sorted(axes)} bytes={out.stat().st_size:,}")


if __name__ == "__main__":
    main()
