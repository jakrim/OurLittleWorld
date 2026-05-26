#!/usr/bin/env python3
"""Regenerate brand PNGs: sprout-only mark (no ring), centered splash/icon."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "assets" / "brand"
MARK_SOURCE = BRAND / "logo-mark.png"

BG = (250, 244, 238, 255)  # #FAF4EE (hearth bg / launch screen)
# Keep the interior sprout; drop the ring stroke and outer halo discs.
INNER_RADIUS = 0.395


def color_dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])))


def is_background(r, g, b, a):
    if a < 12:
        return True
    if color_dist((r, g, b), BG[:3]) < 28:
        return True
    if r < 24 and g < 24 and b < 24:
        return True
    if r > 238 and g > 232 and b > 220:
        return True
    if r > 220 and g > 200 and b > 185 and abs(r - g) < 22:
        return True
    return False


def extract_mark(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    cx, cy = w / 2, h / 2
    radius = min(w, h) / 2
    pixels = rgba.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            nx = math.hypot(x - cx, y - cy) / radius
            if is_background(r, g, b, a) or nx > INNER_RADIUS:
                pixels[x, y] = (0, 0, 0, 0)

    alpha = rgba.split()[3]
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.6))
    alpha = alpha.point(lambda v: 0 if v < 8 else min(255, int(v * 1.05)))
    rgba.putalpha(alpha)

    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Could not find mark bounds in source image")

    return rgba.crop(bbox)


def fit_on_canvas(mark: Image.Image, size: int, fill: float = 0.78, bg=BG) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * fill)
    mark_copy = mark.copy()
    mark_copy.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - mark_copy.width) // 2
    y = (size - mark_copy.height) // 2
    canvas.paste(mark_copy, (x, y), mark_copy)
    return canvas


def splash_canvas(mark: Image.Image, size: int = 800, fill: float = 0.76) -> Image.Image:
    """Square native splash sized so imageWidth maps closely to the mark (not tiny padding)."""
    canvas = Image.new("RGBA", (size, size), BG)
    target = int(size * fill)
    mark_copy = mark.copy()
    mark_copy.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - mark_copy.width) // 2
    y = (size - mark_copy.height) // 2
    canvas.paste(mark_copy, (x, y), mark_copy)
    return canvas


def main():
    mark = extract_mark(Image.open(MARK_SOURCE))

    flat_hires = fit_on_canvas(mark, 1024, fill=0.82, bg=(0, 0, 0, 0))
    flat = flat_hires.resize((512, 512), Image.Resampling.LANCZOS)
    flat.save(BRAND / "logo-mark-flat.png")

    icon = fit_on_canvas(mark, 1024, fill=0.78)
    icon_rgb = icon.convert("RGB")
    icon_rgb.save(BRAND / "icon.png")
    icon_rgb.save(BRAND / "adaptive-icon.png")

    splash = splash_canvas(mark, 800, fill=0.76)
    splash.convert("RGB").save(BRAND / "splash.png")

    print("Wrote logo-mark-flat.png, icon.png, adaptive-icon.png, splash.png")


if __name__ == "__main__":
    main()
