from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app-store" / "screenshots"
IPHONE_DIR = OUT / "iphone-65"
IPAD_DIR = OUT / "ipad-pro-129"

CREAM = "#fbf5ee"
PEACH = "#f4d5ca"
TERRACOTTA = "#c96f4f"
INK = "#2d221f"
MUTED = "#7b625a"
PLUM = "#5f4351"
MOSS = "#7d987b"
SAGE = "#dfe8d8"
GOLD = "#d6a14c"
WHITE = "#fffdf9"
LINE = "#eadbd2"


def font(path, size):
    return ImageFont.truetype(str(ROOT / path), size=size)


FONT_DISPLAY = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 84)
FONT_DISPLAY_BIG = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 98)
FONT_BRAND = font("assets/fonts/Balqis.ttf", 70)
FONT_BODY = font("assets/fonts/DMSans-BoldItalic.ttf", 34)
FONT_BODY_REG = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 32)
FONT_BODY_BOLD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
FONT_SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 26)
FONT_SMALL_BOLD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 26)
FONT_TINY_BOLD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)


SLIDES = [
    {
        "name": "01-baby-book",
        "headline": "Private baby book\nfor the early years.",
        "subhead": "Save photos, firsts, notes, voice memories, and family letters in one shared space.",
        "screen": "welcome",
    },
    {
        "name": "02-timeline",
        "headline": "Photos, notes,\nand voice together.",
        "subhead": "Keep the tiny context your camera roll cannot explain.",
        "screen": "timeline",
    },
    {
        "name": "03-firsts",
        "headline": "Save baby firsts\nas they happen.",
        "subhead": "First smiles, steps, words, foods, and family milestones stay organized by age.",
        "screen": "firsts",
    },
    {
        "name": "04-letters",
        "headline": "Write letters\nfor later.",
        "subhead": "Save notes for your child or partner, kept in your private baby book.",
        "screen": "letters",
    },
    {
        "name": "05-library",
        "headline": "Private family archive.\nNo public feed.",
        "subhead": "Search and revisit moments by day, place, and memory without likes or algorithms.",
        "screen": "library",
    },
]


def mkdirs():
    IPHONE_DIR.mkdir(parents=True, exist_ok=True)
    IPAD_DIR.mkdir(parents=True, exist_ok=True)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def draw_center(draw, xy, text, fnt, fill, spacing=8):
    x, y, w = xy
    lines = text.split("\n")
    total_h = sum(text_size(draw, line, fnt)[1] for line in lines) + spacing * (len(lines) - 1)
    cy = y
    for line in lines:
        tw, th = text_size(draw, line, fnt)
        draw.text((x + (w - tw) / 2, cy), line, font=fnt, fill=fill)
        cy += th + spacing
    return total_h


def wrap_text(draw, text, fnt, max_w):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if text_size(draw, test, fnt)[0] <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_wrapped(draw, x, y, text, fnt, fill, max_w, spacing=10):
    for line in wrap_text(draw, text, fnt, max_w):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += text_size(draw, line, fnt)[1] + spacing
    return y


def rounded_shadow(base, box, radius, shadow=22):
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=(78, 42, 25, 42))
    layer = layer.filter(ImageFilter.GaussianBlur(shadow))
    base.alpha_composite(layer)


def draw_device(draw, base, x, y, w, h, screen_kind):
    rounded_shadow(base, (x, y, x + w, y + h), int(w * 0.105), 30)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=int(w * 0.105), fill="#201817")
    pad = int(w * 0.035)
    sx, sy = x + pad, y + pad
    sw, sh = w - 2 * pad, h - 2 * pad
    draw.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=int(w * 0.075), fill=CREAM)
    draw.rounded_rectangle((x + w * 0.34, y + pad * 0.45, x + w * 0.66, y + pad * 1.55), radius=int(pad * 0.55), fill="#070707")
    draw_app_screen(draw, base, sx, sy, sw, sh, screen_kind)


def draw_tablet(draw, base, x, y, w, h, screen_kind):
    rounded_shadow(base, (x, y, x + w, y + h), int(w * 0.055), 34)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=int(w * 0.055), fill="#201817")
    pad = int(w * 0.028)
    sx, sy = x + pad, y + pad
    sw, sh = w - 2 * pad, h - 2 * pad
    draw.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=int(w * 0.035), fill=CREAM)
    column_w = min(720, int(sw * 0.52))
    column_x = int(sx + (sw - column_w) / 2)
    draw_app_screen(draw, base, column_x, sy, column_w, sh, screen_kind, tablet=False)


def draw_brand(base, x, y, size):
    icon = Image.open(ROOT / "assets" / "brand" / "icon.png").convert("RGBA")
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    base.alpha_composite(icon, (x, y))


def draw_app_screen(draw, base, x, y, w, h, kind, tablet=False):
    scale = w / 640
    margin = int(48 * scale)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=int(44 * scale), fill=CREAM)

    if kind == "welcome":
        draw_brand(base, int(x + w / 2 - 48 * scale), int(y + 88 * scale), int(96 * scale))
        draw_center(draw, (x, y + 198 * scale, w), "our little world", FONT_BRAND if not tablet else font("assets/fonts/Balqis.ttf", int(48 * scale)), TERRACOTTA)
        card = (x + margin, y + 370 * scale, x + w - margin, y + 680 * scale)
        draw_card(draw, card, "10 MONTHS", "Crawls, claps, tiny routines", ["Photos from day one", "Firsts, notes, growth"])
        draw_center(draw, (x + margin, y + 760 * scale, w - 2 * margin), "DIGITAL BABY BOOK", font("assets/fonts/DMSans-BoldItalic.ttf", int(22 * scale)), TERRACOTTA)
        draw_center(draw, (x + margin, y + 830 * scale, w - 2 * margin), "Your baby's story,\nkept from the very\nbeginning.", ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(48 * scale)), INK, 6)
        draw_center(draw, (x + margin, y + 1110 * scale, w - 2 * margin), "Private for your family.\nNo feed. No algorithm.", ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(24 * scale)), MUTED, 8)
        draw.rounded_rectangle((x + margin, y + h - 150 * scale, x + w - margin, y + h - 72 * scale), radius=int(40 * scale), fill=TERRACOTTA)
        draw_center(draw, (x + margin, y + h - 128 * scale, w - 2 * margin), "Start your baby book", font("assets/fonts/DMSans-BoldItalic.ttf", int(27 * scale)), WHITE, 0)
        return

    draw.text((x + margin, y + 72 * scale), "our little world", font=font("assets/fonts/Balqis.ttf", int(42 * scale)), fill=TERRACOTTA)
    if kind == "timeline":
        draw.text((x + margin, y + 150 * scale), "Theo's world", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(50 * scale)), fill=INK)
        draw.text((x + margin, y + 222 * scale), "today", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(22 * scale)), fill=TERRACOTTA)
        draw_prompt(draw, x + margin, y + 280 * scale, w - 2 * margin, scale)
        draw_photo_grid(draw, x + margin, y + 560 * scale, w - 2 * margin, scale)
        draw_timeline(draw, x + margin, y + 920 * scale, w - 2 * margin, scale)
    elif kind == "firsts":
        draw.text((x + margin, y + 150 * scale), "firsts so far.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(50 * scale)), fill=INK)
        draw.text((x + margin, y + 222 * scale), "The little doors they walk through.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(22 * scale)), fill=MUTED)
        entries = [("First laugh", "June 10", MOSS), ("First solid food", "May 28", GOLD), ("First stand", "Saved today", TERRACOTTA), ("First trip", "Brooklyn", PLUM)]
        yy = y + 300 * scale
        for title, detail, color in entries:
            draw_first(draw, x + margin, yy, w - 2 * margin, scale, title, detail, color)
            yy += 165 * scale
    elif kind == "letters":
        draw.text((x + margin, y + 150 * scale), "letters for later.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(50 * scale)), fill=INK)
        draw.text((x + margin, y + 222 * scale), "Small notes, kept with the story.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(22 * scale)), fill=MUTED)
        yy = y + 315 * scale
        letters = [("About your laugh", "Saved with today's story."), ("For next birthday", "A note for later."), ("The day you crawled", "Saved after bedtime.")]
        for title, detail in letters:
            draw_letter(draw, x + margin, yy, w - 2 * margin, scale, title, detail)
            yy += 210 * scale
    elif kind == "library":
        draw.text((x + margin, y + 150 * scale), "a quieter archive.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(48 * scale)), fill=INK)
        draw.text((x + margin, y + 222 * scale), "Photos, places, and saved moments.", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(22 * scale)), fill=MUTED)
        draw_search(draw, x + margin, y + 292 * scale, w - 2 * margin, scale)
        draw_album(draw, x + margin, y + 430 * scale, w - 2 * margin, scale)
        draw_places(draw, x + margin, y + 925 * scale, w - 2 * margin, scale)


def draw_card(draw, box, eyebrow, title, rows):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=48, fill=WHITE, outline="#ffffff", width=3)
    draw.rectangle((x0 + 42, y0 + 42, x0 + 48, y1 - 42), fill=PEACH)
    draw.text((x0 + 92, y0 + 56), eyebrow, font=FONT_TINY_BOLD, fill=TERRACOTTA)
    draw_wrapped(draw, x0 + 92, y0 + 94, title, FONT_BODY_BOLD, INK, x1 - x0 - 150, 6)
    yy = y0 + 178
    for row in rows:
        draw.ellipse((x0 + 92, yy, x0 + 130, yy + 38), fill="#f8eee8")
        draw.text((x0 + 152, yy + 2), row, font=FONT_SMALL_BOLD, fill=MUTED)
        yy += 62


def draw_prompt(draw, x, y, w, scale):
    h = 220 * scale
    draw.rounded_rectangle((x, y, x + w, y + h), radius=int(34 * scale), fill=WHITE)
    draw.text((x + 32 * scale, y + 28 * scale), "DAILY PROMPT", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(20 * scale)), fill=TERRACOTTA)
    draw_wrapped(draw, x + 32 * scale, y + 72 * scale, "What tiny thing do you want to remember about today?", ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", int(32 * scale)), INK, w - 64 * scale, int(6 * scale))
    draw.rounded_rectangle((x + 32 * scale, y + h - 64 * scale, x + 210 * scale, y + h - 24 * scale), radius=int(20 * scale), fill=SAGE)
    draw.text((x + 56 * scale, y + h - 56 * scale), "Add note", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(18 * scale)), fill="#49644a")


def draw_photo_grid(draw, x, y, w, scale):
    gap = 14 * scale
    size = (w - 2 * gap) / 3
    colors = [PEACH, SAGE, "#efd7a4", "#e5c4cd", "#d8e1ef", "#ead9cc"]
    for i in range(6):
        cx = x + (i % 3) * (size + gap)
        cy = y + (i // 3) * (size + gap)
        draw.rounded_rectangle((cx, cy, cx + size, cy + size), radius=int(22 * scale), fill=colors[i])
        draw.ellipse((cx + size * 0.18, cy + size * 0.15, cx + size * 0.46, cy + size * 0.43), fill=WHITE)
        draw.rounded_rectangle((cx + size * 0.12, cy + size * 0.58, cx + size * 0.88, cy + size * 0.78), radius=int(10 * scale), fill=(255, 255, 255))


def draw_timeline(draw, x, y, w, scale):
    draw.text((x, y), "Recent moments", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(24 * scale)), fill=INK)
    yy = y + 56 * scale
    for title, detail, color in [("First park morning", "4 photos saved", MOSS), ("Late-night note", "A tiny laugh after bath", TERRACOTTA), ("Weekly digest", "Sunday memory set", GOLD)]:
        draw.rounded_rectangle((x, yy, x + w, yy + 96 * scale), radius=int(24 * scale), fill=WHITE)
        draw.ellipse((x + 22 * scale, yy + 22 * scale, x + 74 * scale, yy + 74 * scale), fill=color)
        draw.text((x + 96 * scale, yy + 18 * scale), title, font=font("assets/fonts/DMSans-BoldItalic.ttf", int(22 * scale)), fill=INK)
        draw.text((x + 96 * scale, yy + 52 * scale), detail, font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(18 * scale)), fill=MUTED)
        yy += 116 * scale


def draw_first(draw, x, y, w, scale, title, detail, color):
    draw.rounded_rectangle((x, y, x + w, y + 132 * scale), radius=int(28 * scale), fill=WHITE)
    draw.ellipse((x + 24 * scale, y + 26 * scale, x + 102 * scale, y + 104 * scale), fill=color)
    draw.text((x + 130 * scale, y + 28 * scale), title, font=font("assets/fonts/DMSans-BoldItalic.ttf", int(27 * scale)), fill=INK)
    draw.text((x + 130 * scale, y + 70 * scale), detail, font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(20 * scale)), fill=MUTED)
    draw.rounded_rectangle((x + w - 156 * scale, y + 42 * scale, x + w - 28 * scale, y + 90 * scale), radius=int(24 * scale), fill="#f8eee8")
    draw.text((x + w - 126 * scale, y + 52 * scale), "Saved", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(17 * scale)), fill=TERRACOTTA)


def draw_letter(draw, x, y, w, scale, title, detail):
    draw.rounded_rectangle((x, y, x + w, y + 168 * scale), radius=int(30 * scale), fill=WHITE)
    draw.rectangle((x + 32 * scale, y + 34 * scale, x + 38 * scale, y + 134 * scale), fill=PEACH)
    draw.text((x + 64 * scale, y + 32 * scale), title, font=font("assets/fonts/DMSans-BoldItalic.ttf", int(26 * scale)), fill=INK)
    draw.text((x + 64 * scale, y + 76 * scale), detail, font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(20 * scale)), fill=MUTED)
    draw.rounded_rectangle((x + 64 * scale, y + 114 * scale, x + 226 * scale, y + 148 * scale), radius=int(17 * scale), fill=SAGE)
    draw.text((x + 88 * scale, y + 121 * scale), "kept", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(16 * scale)), fill="#49644a")


def draw_search(draw, x, y, w, scale):
    draw.rounded_rectangle((x, y, x + w, y + 78 * scale), radius=int(28 * scale), fill=WHITE)
    draw.ellipse((x + 28 * scale, y + 25 * scale, x + 56 * scale, y + 53 * scale), outline=MUTED, width=max(1, int(3 * scale)))
    draw.line((x + 50 * scale, y + 48 * scale, x + 66 * scale, y + 64 * scale), fill=MUTED, width=max(1, int(3 * scale)))
    draw.text((x + 88 * scale, y + 24 * scale), "Search-ready, not noisy", font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(20 * scale)), fill=MUTED)


def draw_album(draw, x, y, w, scale):
    draw.text((x, y), "Saved moments", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(24 * scale)), fill=INK)
    y += 54 * scale
    gap = 16 * scale
    card_w = (w - gap) / 2
    for i, title in enumerate(["Morning light", "Bath laughs", "Tiny hands", "Park blanket"]):
        cx = x + (i % 2) * (card_w + gap)
        cy = y + (i // 2) * (card_w * 0.82 + gap)
        draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_w * 0.82), radius=int(24 * scale), fill=[PEACH, SAGE, "#efd7a4", "#e5c4cd"][i])
        draw.rounded_rectangle((cx + 18 * scale, cy + card_w * 0.58, cx + card_w - 18 * scale, cy + card_w * 0.74), radius=int(16 * scale), fill=(255, 255, 255))
        draw.text((cx + 32 * scale, cy + card_w * 0.61), title, font=font("assets/fonts/DMSans-BoldItalic.ttf", int(16 * scale)), fill=INK)


def draw_places(draw, x, y, w, scale):
    draw.text((x, y), "Places", font=font("assets/fonts/DMSans-BoldItalic.ttf", int(24 * scale)), fill=INK)
    y += 50 * scale
    for i, (place, count, color) in enumerate([("home", "122", MOSS), ("park", "34", GOLD), ("grandparents", "18", PLUM)]):
        yy = y + i * 82 * scale
        draw.rounded_rectangle((x, yy, x + w, yy + 64 * scale), radius=int(22 * scale), fill=WHITE)
        draw.ellipse((x + 22 * scale, yy + 17 * scale, x + 52 * scale, yy + 47 * scale), fill=color)
        draw.text((x + 72 * scale, yy + 18 * scale), place, font=ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", int(19 * scale)), fill=INK)
        draw.text((x + w - 78 * scale, yy + 18 * scale), count, font=font("assets/fonts/DMSans-BoldItalic.ttf", int(19 * scale)), fill=MUTED)


def poster(size, slide, device="phone"):
    W, H = size
    img = Image.new("RGBA", (W, H), CREAM)
    draw = ImageDraw.Draw(img)
    for i in range(H):
        t = i / H
        r = int(251 * (1 - t) + 244 * t)
        g = int(245 * (1 - t) + 213 * t)
        b = int(238 * (1 - t) + 202 * t)
        draw.line((0, i, W, i), fill=(r, g, b, 255))
    draw.ellipse((-W * 0.22, H * 0.18, W * 0.52, H * 0.58), fill=(255, 255, 255, 70))
    draw.ellipse((W * 0.57, H * 0.02, W * 1.18, H * 0.34), fill=(255, 255, 255, 58))

    top = 132 if device == "phone" else 96
    draw_center(draw, (80, top, W - 160), slide["headline"], FONT_DISPLAY_BIG if device == "phone" else ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf", 102), INK, 12)
    sub_font = FONT_BODY_REG if device == "phone" else ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 40)
    sub_y = top + (250 if device == "phone" else 250)
    lines = wrap_text(draw, slide["subhead"], sub_font, W - 230)
    yy = sub_y
    for line in lines:
        tw, th = text_size(draw, line, sub_font)
        draw.text(((W - tw) / 2, yy), line, font=sub_font, fill=MUTED)
        yy += th + 9

    if device == "phone":
        dw, dh = 690, 1495
        dx, dy = (W - dw) // 2, H - dh - 170
        draw_device(draw, img, dx, dy, dw, dh, slide["screen"])
    else:
        tw, th = 1540, 1690
        dx, dy = (W - tw) // 2, H - th - 150
        draw_tablet(draw, img, dx, dy, tw, th, slide["screen"])

    return img.convert("RGB")


def main():
    mkdirs()
    for slide in SLIDES:
        poster((1284, 2778), slide, "phone").save(IPHONE_DIR / f"{slide['name']}.png", quality=96)
        poster((2048, 2732), slide, "tablet").save(IPAD_DIR / f"{slide['name']}.png", quality=96)
    print(f"Wrote {len(SLIDES)} iPhone screenshots to {IPHONE_DIR}")
    print(f"Wrote {len(SLIDES)} iPad screenshots to {IPAD_DIR}")


if __name__ == "__main__":
    main()
