#!/usr/bin/env python3
"""Regenerate brand PNGs: centered app icon, splash, and launch assets."""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageFilter
from PIL import ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "assets" / "brand"
MARK_SOURCE = BRAND / "logo-mark.png"

BG = (250, 244, 238, 255)  # #FAF4EE (hearth bg / launch screen)
DARK_BG = (26, 19, 14, 255)  # #1A130E
# Keep the interior sprout; drop the ring stroke and outer halo discs.
INNER_RADIUS = 0.395
IOS_ASSETS = ROOT / "ios" / "OurLittleWorld" / "Images.xcassets"


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


def scaled_to_fit(image: Image.Image, target: int) -> Image.Image:
    scale = target / max(image.width, image.height)
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def visual_bbox(image: Image.Image, bg=BG):
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    alpha = Image.new("L", rgba.size, 0)
    alpha_pixels = alpha.load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a >= 12 and color_dist((r, g, b), bg[:3]) >= 18:
                alpha_pixels[x, y] = 255

    return alpha.getbbox()


def crop_visual(image: Image.Image, bg=BG) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = visual_bbox(rgba, bg)
    if not bbox:
        raise RuntimeError("Could not find visual bounds in source image")
    return rgba.crop(bbox)


def transparent_logo(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if is_background(r, g, b, a):
                pixels[x, y] = (0, 0, 0, 0)

    alpha = rgba.split()[3].filter(ImageFilter.GaussianBlur(radius=0.35))
    alpha = alpha.point(lambda v: 0 if v < 8 else v)
    rgba.putalpha(alpha)

    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("Could not find transparent logo bounds in source image")
    return rgba.crop(bbox)


def crop_primary_ring_logo(image: Image.Image, padding: int = 10) -> Image.Image:
    rgba = image.convert("RGBA")
    orange = []

    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = rgba.getpixel((x, y))
            if a > 20 and r > 150 and 45 < g < 150 and b < 130:
                orange.append((x, y))

    if not orange:
        raise RuntimeError("Could not find primary logo ring in source image")

    left = min(x for x, _ in orange)
    top = min(y for _, y in orange)
    right = max(x for x, _ in orange) + 1
    bottom = max(y for _, y in orange) + 1
    cx = (left + right) / 2
    cy = (top + bottom) / 2
    side = max(right - left, bottom - top) + padding * 2
    crop_box = (
        round(cx - side / 2),
        round(cy - side / 2),
        round(cx + side / 2),
        round(cy + side / 2),
    )

    cropped = Image.new("RGBA", (crop_box[2] - crop_box[0], crop_box[3] - crop_box[1]), (0, 0, 0, 0))
    cropped.alpha_composite(rgba, (-crop_box[0], -crop_box[1]))

    mask = Image.new("L", cropped.size, 0)
    draw = ImageDraw.Draw(mask)
    inset = 1
    draw.ellipse(
        (inset, inset, cropped.width - inset - 1, cropped.height - inset - 1),
        fill=255,
    )
    cropped.putalpha(Image.composite(cropped.getchannel("A"), Image.new("L", cropped.size, 0), mask))
    return cropped


def fit_on_canvas(mark: Image.Image, size: int, fill: float = 0.78, bg=BG) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * fill)
    mark_copy = scaled_to_fit(mark, target)
    x = (size - mark_copy.width) // 2
    y = (size - mark_copy.height) // 2
    canvas.paste(mark_copy, (x, y), mark_copy)
    return canvas


def splash_canvas(mark: Image.Image, size: int = 800, fill: float = 0.76) -> Image.Image:
    """Square native splash sized so imageWidth maps closely to the logo."""
    canvas = Image.new("RGBA", (size, size), BG)
    target = int(size * fill)
    mark_copy = scaled_to_fit(mark, target)
    x = (size - mark_copy.width) // 2
    y = (size - mark_copy.height) // 2
    canvas.paste(mark_copy, (x, y), mark_copy)
    return canvas


def write_ios_splash_contents(splash_dir: Path):
    dark_appearance = [{"appearance": "luminosity", "value": "dark"}]
    images = []
    for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
        images.append({
            "idiom": "universal",
            "filename": f"image{suffix}.png",
            "scale": f"{scale}x",
        })
    for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
        images.append({
            "idiom": "universal",
            "appearances": dark_appearance,
            "filename": f"dark_image{suffix}.png",
            "scale": f"{scale}x",
        })

    (splash_dir / "Contents.json").write_text(
        json.dumps(
            {
                "images": images,
                "info": {"version": 1, "author": "expo"},
            },
            indent=2,
        )
        + "\n"
    )


def write_ios_color_contents(colors_dir: Path):
    colors = [
        {
            "color": {
                "components": {
                    "alpha": "1.000",
                    "blue": "0.933333333333333",
                    "green": "0.956862745098039",
                    "red": "0.980392156862745",
                },
                "color-space": "srgb",
            },
            "idiom": "universal",
        },
        {
            "color": {
                "components": {
                    "alpha": "1.000",
                    "blue": "0.054901960784314",
                    "green": "0.074509803921569",
                    "red": "0.101960784313725",
                },
                "color-space": "srgb",
            },
            "idiom": "universal",
            "appearances": [{"appearance": "luminosity", "value": "dark"}],
        },
    ]
    colors_dir.mkdir(parents=True, exist_ok=True)
    (colors_dir / "Contents.json").write_text(
        json.dumps(
            {
                "colors": colors,
                "info": {"version": 1, "author": "expo"},
            },
            indent=2,
        )
        + "\n"
    )


def write_ios_copies(app_icon: Image.Image, splash: Image.Image, dark_splash: Image.Image):
    app_icon_dir = IOS_ASSETS / "AppIcon.appiconset"
    splash_dir = IOS_ASSETS / "SplashScreenLogo.imageset"
    colors_dir = IOS_ASSETS / "SplashScreenBackground.colorset"

    if app_icon_dir.exists():
        app_icon.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGB").save(
            app_icon_dir / "App-Icon-1024x1024@1x.png"
        )

    if splash_dir.exists():
        for scale, suffix in [(1, ""), (2, "@2x"), (3, "@3x")]:
            splash.resize((280 * scale, 280 * scale), Image.Resampling.LANCZOS).convert(
                "RGB"
            ).save(splash_dir / f"image{suffix}.png")
            dark_splash.resize((280 * scale, 280 * scale), Image.Resampling.LANCZOS).convert(
                "RGB"
            ).save(splash_dir / f"dark_image{suffix}.png")
        write_ios_splash_contents(splash_dir)

    if colors_dir.exists():
        write_ios_color_contents(colors_dir)


def main():
    source = Image.open(MARK_SOURCE)
    mark = extract_mark(source)
    app_icon_mark = crop_visual(source)
    transparent_mark = transparent_logo(source)
    ring_logo = crop_primary_ring_logo(source)

    flat_hires = fit_on_canvas(mark, 1024, fill=0.82, bg=(0, 0, 0, 0))
    flat = flat_hires.resize((512, 512), Image.Resampling.LANCZOS)
    flat.save(BRAND / "logo-mark-flat.png")

    header_logo = fit_on_canvas(ring_logo, 512, fill=1.0, bg=(0, 0, 0, 0))
    header_logo.save(BRAND / "logo-mark-circle.png")

    icon = fit_on_canvas(app_icon_mark, 1024, fill=0.86)
    icon_rgb = icon.convert("RGB")
    icon_rgb.save(BRAND / "icon.png")

    adaptive_icon = fit_on_canvas(mark, 1024, fill=0.78, bg=(0, 0, 0, 0))
    adaptive_icon.save(BRAND / "adaptive-icon.png")

    splash = splash_canvas(app_icon_mark, 800, fill=0.76)
    splash.convert("RGB").save(BRAND / "splash.png")
    dark_splash = fit_on_canvas(transparent_mark, 800, fill=0.62, bg=DARK_BG)
    dark_splash.convert("RGB").save(BRAND / "splash-dark.png")
    write_ios_copies(icon, splash, dark_splash)

    print("Wrote brand PNGs and native iOS icon/splash copies")


if __name__ == "__main__":
    main()
