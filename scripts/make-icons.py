#!/usr/bin/env python3
"""Draws Roomwave's icons from the mark: five rising bars on an ink square.

    python3 scripts/make-icons.py

Writes favicon.ico, icon.svg, apple-touch-icon.png, icon-192.png, icon-512.png
and icon-maskable-512.png into apps/site/public.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps" / "site" / "public"
INK = (29, 20, 48)
SIGNAL = (255, 106, 43)
BARS = [(0, 9), (7, 15), (14, 22), (21, 15), (28, 24)]  # x, height in a 33 x 24 box


def draw(size: int, padding: float, radius: float) -> Image.Image:
    scale = 4  # draw large, then shrink, for smooth edges
    big = size * scale
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius * big, fill=INK)
    inner = big * (1 - 2 * padding)
    unit = inner / 33
    left = (big - 33 * unit) / 2
    top = (big - 24 * unit) / 2
    for x, h in BARS:
        x0 = left + x * unit
        y0 = top + (24 - h) * unit
        d.rounded_rectangle((x0, y0, x0 + 5 * unit, top + 24 * unit), radius=2.5 * unit, fill=SIGNAL)
    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw(180, 0.2, 0.0).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    draw(192, 0.2, 0.22).save(OUT / "icon-192.png", optimize=True)
    draw(512, 0.2, 0.22).save(OUT / "icon-512.png", optimize=True)
    # Maskable icons keep everything inside the central safe zone.
    draw(512, 0.28, 0.0).convert("RGB").save(OUT / "icon-maskable-512.png", optimize=True)
    icons = [draw(s, 0.16, 0.22) for s in (16, 32, 48)]
    icons[2].save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=icons[:2])

    rects = "".join(
        f'<rect x="{4.5 + x}" y="{8.5 + 24 - h}" width="5" height="{h}" rx="2.5" fill="#ff6a2b"/>' for x, h in BARS
    )
    (OUT / "icon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 41"><rect width="42" height="41" rx="9" fill="#1d1430"/>{rects}</svg>\n'
    )


if __name__ == "__main__":
    main()
