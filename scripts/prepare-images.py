#!/usr/bin/env python3
"""Turns the photo masters into the files the site and app serve.

    python3 scripts/prepare-images.py generated/masters

Writes, and these are committed:
  apps/site/src/assets/photos/<name>.jpg       marketing photos, 2000 px wide; Astro makes
                                               the responsive AVIF/WebP versions at build
  apps/site/public/media/slides/<id>.webp      pictures for content slides, 1600 px
  apps/site/public/media/slides/<id>-small.webp  the same at 480 px, for the picker
  apps/site/src/assets/overlay/<name>-mask.png where the real interface shows through
  apps/site/src/data/overlays.json             the screen corners, scaled to the photos
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "apps" / "site"
PHOTO_WIDTH = 2000

MARKETING = [
    "hall-audience-wide",
    "phone-in-hand",
    "lecture-theatre",
    "community-hall",
    "town-hall",
    "panel-discussion",
    "workshop-table",
    "team-applause",
    "city-dusk",
    "presenter-laptop",
]

SLIDE_LIBRARY = [
    "hall-audience-wide",
    "lecture-theatre",
    "community-hall",
    "town-hall",
    "workshop-table",
    "panel-discussion",
    "team-applause",
    "city-dusk",
    "warm-texture",
    "lagoon-texture",
]

OVERLAYS = ["hall-audience-wide", "phone-in-hand"]


def resized(image: Image.Image, width: int) -> Image.Image:
    if image.width <= width:
        return image.copy()
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def main(masters: Path) -> None:
    photos = SITE / "src" / "assets" / "photos"
    slides = SITE / "public" / "media" / "slides"
    overlay_dir = SITE / "src" / "assets" / "overlay"
    data_dir = SITE / "src" / "data"
    for folder in (photos, slides, overlay_dir, data_dir):
        folder.mkdir(parents=True, exist_ok=True)

    for name in MARKETING:
        with Image.open(masters / f"{name}.jpg") as image:
            resized(image.convert("RGB"), PHOTO_WIDTH).save(photos / f"{name}.jpg", quality=84, optimize=True, progressive=True)
            print(f"photo  {name}")

    for name in SLIDE_LIBRARY:
        with Image.open(masters / f"{name}.jpg") as image:
            rgb = image.convert("RGB")
            resized(rgb, 1600).save(slides / f"{name}.webp", quality=80, method=6)
            resized(rgb, 480).save(slides / f"{name}-small.webp", quality=74, method=6)
            print(f"slide  {name}")

    overlays = {}
    for name in OVERLAYS:
        info = json.loads((masters / f"{name}.corners.json").read_text())
        width, height = info["pixels"]
        scale = min(1.0, PHOTO_WIDTH / width)
        with Image.open(masters / info["mask"]) as mask:
            # White in the mask is glass the interface may show on. As alpha it
            # can be used directly as a CSS mask.
            gray = mask.convert("L")
            size = (round(width * scale), round(height * scale))
            alpha = gray.resize(size, Image.LANCZOS)
            out = Image.new("LA", size, 255)
            out.putalpha(alpha)
            out.save(overlay_dir / f"{name}-mask.png", optimize=True)
        corners = info["corners"]
        overlays[name] = {
            "width": round(width * scale),
            "height": round(height * scale),
            "corners": [
                [round(corners[key][0] * scale, 1), round(corners[key][1] * scale, 1)]
                for key in ("top_left", "top_right", "bottom_right", "bottom_left")
            ],
        }
        print(f"mask   {name}")

    (data_dir / "overlays.json").write_text(json.dumps(overlays, indent=2) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: prepare-images.py <masters folder>")
    main(Path(sys.argv[1]).resolve())
