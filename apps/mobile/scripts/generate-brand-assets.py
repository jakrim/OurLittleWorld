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
MARK_SOURCE = BRAND / "logo-mark-circle.png"
ICON_COMPOSER_LAYERS = BRAND / "icon-composer-layers"
ICON_COMPOSER_DOCUMENT_ASSETS = BRAND / "our-little-world.icon" / "Assets"

BG = (250, 244, 238, 255)  # #FAF4EE (hearth bg / launch screen)
DARK_BG = (26, 19, 14, 255)  # #1A130E
SPLASH_IMAGE_WIDTH = 240
# Keep the interior sprout; drop the ring stroke and outer halo discs.
INNER_RADIUS = 0.395
IOS_ASSETS = ROOT / "ios" / "OurLittleWorld" / "Images.xcassets"

BADGE_CREAM = (255, 250, 244, 255)
BADGE_RIM = (255, 255, 252, 255)
TERRACOTTA = (217, 119, 91, 255)
TERRACOTTA_DARK = (196, 94, 70, 255)
GOLD = (211, 158, 82, 255)
PLUM = (83, 65, 77, 255)
ROSE = (197, 93, 118, 255)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(round(lerp(a, b, t)) for a, b in zip(c1, c2))


def xy(point, scale):
    return (round(point[0] * scale), round(point[1] * scale))


def cubic(p0, p1, p2, p3, steps=36):
    points = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        points.append((x, y))
    return points


def draw_round_line(draw: ImageDraw.ImageDraw, points, scale, fill, width):
    scaled = [xy(point, scale) for point in points]
    draw.line(scaled, fill=fill, width=round(width * scale), joint="curve")
    radius = round(width * scale / 2)
    for x, y in (scaled[0], scaled[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_gradient_dot(draw: ImageDraw.ImageDraw, center, radius, scale, base):
    cx, cy = xy(center, scale)
    r = round(radius * scale)
    light = mix(base, (255, 255, 255, 255), 0.16)
    for i in range(r, 0, -1):
        t = i / r
        color = mix(light, base, min(1, t * 0.92))
        draw.ellipse((cx - i, cy - i, cx + i, cy + i), fill=color)


def draw_leaf(draw: ImageDraw.ImageDraw, points, scale, fill):
    scaled = [xy(point, scale) for point in points]
    draw.polygon(scaled, fill=fill)


def heart_points(cx=256, cy=394, width=78, height=72, steps=128):
    raw = []
    for i in range(steps):
        t = (math.pi * 2 * i) / steps
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        raw.append((x, y))
    min_x = min(x for x, _ in raw)
    max_x = max(x for x, _ in raw)
    min_y = min(y for _, y in raw)
    max_y = max(y for _, y in raw)
    return [
        (
            cx + ((x - min_x) / (max_x - min_x) - 0.5) * width,
            cy + ((y - min_y) / (max_y - min_y) - 0.5) * height,
        )
        for x, y in raw
    ]


def draw_rooted_badge(size: int = 1024) -> Image.Image:
    """Draw a crisp rooted logo badge without relying on the 512px raster source."""
    aa = 4
    canvas_size = size * aa
    scale = canvas_size / 512
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse(
        tuple(round(v * scale) for v in (18, 24, 494, 500)),
        fill=(42, 29, 22, 24),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=round(10 * scale)))
    image.alpha_composite(shadow)

    draw = ImageDraw.Draw(image)
    draw.ellipse(tuple(round(v * scale) for v in (13, 10, 499, 496)), fill=BADGE_RIM)
    draw.ellipse(tuple(round(v * scale) for v in (23, 20, 489, 486)), fill=BADGE_CREAM)

    draw.ellipse(
        tuple(round(v * scale) for v in (49, 49, 463, 463)),
        outline=TERRACOTTA,
        width=round(12 * scale),
    )

    stem_width = 9
    draw_round_line(draw, [(256, 158), (256, 388)], scale, GOLD, stem_width)
    draw_round_line(draw, cubic((254, 323), (233, 268), (196, 244), (157, 229)), scale, GOLD, stem_width)
    draw_round_line(draw, cubic((258, 323), (279, 268), (316, 244), (355, 229)), scale, GOLD, stem_width)

    left_leaf = cubic((225, 334), (195, 337), (160, 312), (151, 278), 28) + cubic((151, 278), (187, 279), (219, 297), (225, 334), 28)
    right_leaf = [(512 - x, y) for x, y in left_leaf]
    draw_leaf(draw, left_leaf, scale, GOLD)
    draw_leaf(draw, right_leaf, scale, GOLD)

    outer_heart = heart_points()
    inner_heart = heart_points(cx=256, cy=395, width=51, height=47)
    draw.polygon([xy(point, scale) for point in outer_heart], fill=TERRACOTTA)
    draw.polygon([xy(point, scale) for point in inner_heart], fill=BADGE_CREAM)

    draw_gradient_dot(draw, (256, 139), 31, scale, TERRACOTTA_DARK)
    draw_gradient_dot(draw, (151, 221), 30, scale, PLUM)
    draw_gradient_dot(draw, (361, 221), 30, scale, ROSE)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def draw_icon_composer_layers(size: int = 1024) -> dict[str, Image.Image]:
    """Draw full-canvas layers for Apple's Icon Composer."""
    aa = 2
    canvas_size = size * aa
    scale = canvas_size / 512

    def layer(background=(0, 0, 0, 0)):
        return Image.new("RGBA", (canvas_size, canvas_size), background)

    background = layer(BG)

    badge = layer()
    shadow = layer()
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse(
        tuple(round(v * scale) for v in (18, 24, 494, 500)),
        fill=(42, 29, 22, 28),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=round(10 * scale)))
    badge.alpha_composite(shadow)
    badge_draw = ImageDraw.Draw(badge)
    badge_draw.ellipse(tuple(round(v * scale) for v in (13, 10, 499, 496)), fill=BADGE_RIM)
    badge_draw.ellipse(tuple(round(v * scale) for v in (23, 20, 489, 486)), fill=BADGE_CREAM)

    ring = layer()
    ring_draw = ImageDraw.Draw(ring)
    ring_draw.ellipse(
        tuple(round(v * scale) for v in (49, 49, 463, 463)),
        outline=TERRACOTTA,
        width=round(12 * scale),
    )

    sprout = layer()
    sprout_draw = ImageDraw.Draw(sprout)
    stem_width = 9
    draw_round_line(sprout_draw, [(256, 158), (256, 388)], scale, GOLD, stem_width)
    draw_round_line(sprout_draw, cubic((254, 323), (233, 268), (196, 244), (157, 229)), scale, GOLD, stem_width)
    draw_round_line(sprout_draw, cubic((258, 323), (279, 268), (316, 244), (355, 229)), scale, GOLD, stem_width)
    left_leaf = cubic((225, 334), (195, 337), (160, 312), (151, 278), 28) + cubic(
        (151, 278), (187, 279), (219, 297), (225, 334), 28
    )
    draw_leaf(sprout_draw, left_leaf, scale, GOLD)
    draw_leaf(sprout_draw, [(512 - x, y) for x, y in left_leaf], scale, GOLD)

    dots = layer()
    dots_draw = ImageDraw.Draw(dots)
    draw_gradient_dot(dots_draw, (256, 139), 31, scale, TERRACOTTA_DARK)
    draw_gradient_dot(dots_draw, (151, 221), 30, scale, PLUM)
    draw_gradient_dot(dots_draw, (361, 221), 30, scale, ROSE)

    heart = layer()
    heart_draw = ImageDraw.Draw(heart)
    heart_draw.polygon([xy(point, scale) for point in heart_points()], fill=TERRACOTTA)
    heart_draw.polygon(
        [xy(point, scale) for point in heart_points(cx=256, cy=395, width=51, height=47)],
        fill=BADGE_CREAM,
    )

    return {
        "01-background.png": background,
        "02-cream-badge.png": badge,
        "03-terracotta-ring.png": ring,
        "04-gold-sprout.png": sprout,
        "05-flower-dots.png": dots,
        "06-heart.png": heart,
    }


def write_icon_composer_layers():
    ICON_COMPOSER_LAYERS.mkdir(parents=True, exist_ok=True)
    for filename, image in draw_icon_composer_layers().items():
        rendered = image.resize((1024, 1024), Image.Resampling.LANCZOS)
        rendered.save(ICON_COMPOSER_LAYERS / filename, optimize=True)
        if ICON_COMPOSER_DOCUMENT_ASSETS.exists():
            rendered.save(ICON_COMPOSER_DOCUMENT_ASSETS / filename, optimize=True)


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


def fit_on_canvas(mark: Image.Image, size: int, fill: float = 0.78, bg=BG) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
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
            splash.resize((SPLASH_IMAGE_WIDTH * scale, SPLASH_IMAGE_WIDTH * scale), Image.Resampling.LANCZOS).save(
                splash_dir / f"image{suffix}.png"
            )
            dark_splash.resize((SPLASH_IMAGE_WIDTH * scale, SPLASH_IMAGE_WIDTH * scale), Image.Resampling.LANCZOS).save(
                splash_dir / f"dark_image{suffix}.png"
            )
        write_ios_splash_contents(splash_dir)

    if colors_dir.exists():
        write_ios_color_contents(colors_dir)


def main():
    source = Image.open(MARK_SOURCE)
    app_icon_mark = crop_visual(source)

    icon = fit_on_canvas(app_icon_mark, 1024, fill=0.86)
    icon_rgb = icon.convert("RGB")
    icon_rgb.save(BRAND / "icon.png")

    adaptive_icon = fit_on_canvas(app_icon_mark, 1024, fill=0.78, bg=(0, 0, 0, 0))
    adaptive_icon.save(BRAND / "adaptive-icon.png")

    splash_badge = draw_icon_composer_layers(1200)["02-cream-badge.png"]
    splash = splash_badge.resize((1200, 1200), Image.Resampling.LANCZOS)
    splash.save(BRAND / "splash.png")
    dark_splash = splash.copy()
    dark_splash.save(BRAND / "splash-dark.png")
    write_icon_composer_layers()
    write_ios_copies(icon, splash, dark_splash)

    print("Wrote brand PNGs, Icon Composer layers, and native iOS icon/splash copies")


if __name__ == "__main__":
    main()
