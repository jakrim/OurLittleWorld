from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
APP_STORE_DIR = ROOT / "app-store"
SOURCE_DIR = APP_STORE_DIR / "source-ui" / "iphone-16-pro"
OUT_DIR = APP_STORE_DIR / "screenshots" / "iphone-65"
REVIEW_DIR = APP_STORE_DIR / "review"

CANVAS_SIZE = (1284, 2778)
CREAM = "#fbf6f0"
INK = "#2d211e"
MUTED = "#78675f"
TERRACOTTA = "#c96b4b"
PLUM = "#6f4e5e"
MOSS = "#748b75"
GOLD = "#b9893e"
WHITE = "#fffdf9"
LINE = "#eadbd1"

FONT_DIR = ROOT / "node_modules" / "@expo-google-fonts"
NEWSREADER = FONT_DIR / "newsreader" / "500Medium" / "Newsreader_500Medium.ttf"
MANROPE_REG = FONT_DIR / "manrope" / "400Regular" / "Manrope_400Regular.ttf"
MANROPE_SEMI = FONT_DIR / "manrope" / "600SemiBold" / "Manrope_600SemiBold.ttf"
MANROPE_BOLD = FONT_DIR / "manrope" / "700Bold" / "Manrope_700Bold.ttf"
BALQIS = ROOT / "assets" / "fonts" / "Balqis.ttf"

LEGACY_IPHONE_FILES = {
    "01-baby-book.png",
    "02-timeline.png",
    "03-firsts.png",
    "04-letters.png",
    "05-library.png",
}

SLIDES = [
    {
        "name": "01-you-decide",
        "source": "01-discovery.png",
        "eyebrow": "PRIVATE PHOTO DISCOVERY",
        "headline": "Likely moments.\nYou decide what stays.",
        "subhead": (
            "If you allow photo access, discovery stays on this device until "
            "you approve what belongs."
        ),
        "proof": "ON-DEVICE · PARENT APPROVED",
        "accent": TERRACOTTA,
    },
    {
        "name": "02-one-calm-step",
        "source": "02-today.png",
        "eyebrow": "ONE CALM NEXT STEP",
        "headline": "Remember more.\nDo less.",
        "subhead": (
            "Today brings the next prompt, First, review, or family-memory "
            "action into one quiet place."
        ),
        "proof": "TODAY · ADD · OUR WORLD",
        "accent": PLUM,
    },
    {
        "name": "03-capture-your-way",
        "source": "03-add.png",
        "eyebrow": "CAPTURE IT YOUR WAY",
        "headline": "Photos. Notes.\nVoices. Letters.",
        "subhead": (
            "Add the moment before the details slip away—without required "
            "titles, tags, or filing."
        ),
        "proof": "PHOTO · NOTE · VOICE · FIRST · LETTER",
        "accent": TERRACOTTA,
    },
    {
        "name": "04-held-together",
        "source": "04-world.png",
        "eyebrow": "ONE PRIVATE FAMILY RECORD",
        "headline": "Everything you keep,\nheld together.",
        "subhead": (
            "Photos, words, voices, Firsts, and letters live in the same "
            "private family world."
        ),
        "proof": "NO PUBLIC FEED",
        "accent": MOSS,
    },
    {
        "name": "05-story-behind-photo",
        "source": "05-moment.png",
        "eyebrow": "CONTEXT THAT STAYS CONNECTED",
        "headline": "Keep the story\nbehind the photo.",
        "subhead": (
            "Link a saved moment to a First, a letter, its place, and the day "
            "it belongs to."
        ),
        "proof": "PHOTO · FIRST · LETTER · PLACE",
        "accent": GOLD,
    },
    {
        "name": "06-day-by-day",
        "source": "06-timeline.png",
        "eyebrow": "DAY BY DAY · MONTH BY MONTH",
        "headline": "Watch your family\nstory take shape.",
        "subhead": (
            "Browse saved days and a timeline that grows only from moments "
            "your family keeps."
        ),
        "proof": "ONLY PARENT-KEPT MOMENTS",
        "accent": PLUM,
    },
    {
        "name": "07-find-again",
        "source": "07-places.png",
        "eyebrow": "LESS FILING · MORE FINDING",
        "headline": "Find the moments\nyou meant to revisit.",
        "subhead": (
            "Browse by month, place, collection, or search—without a public "
            "feed deciding what matters."
        ),
        "proof": "MONTHS · PLACES · COLLECTIONS · SEARCH",
        "accent": MOSS,
    },
    {
        "name": "08-private-export",
        "source": "08-export.png",
        "eyebrow": "YOUR FAMILY RECORD",
        "headline": "Private by design.\nExportable by you.",
        "subhead": (
            "Build a family archive PDF or share a private summary. No likes, "
            "followers, or public link."
        ),
        "proof": "PDF ARCHIVE · PRIVATE SUMMARY",
        "accent": TERRACOTTA,
    },
]


def load_font(path, size):
    return ImageFont.truetype(str(path), size=size)


FONT_HEADLINE = load_font(NEWSREADER, 86)
FONT_SUBHEAD = load_font(MANROPE_REG, 31)
FONT_EYEBROW = load_font(MANROPE_BOLD, 23)
FONT_PROOF = load_font(MANROPE_BOLD, 20)
FONT_SAMPLE = load_font(MANROPE_SEMI, 18)
FONT_BRAND = load_font(BALQIS, 56)
FONT_REVIEW_TITLE = load_font(NEWSREADER, 48)
FONT_REVIEW_LABEL = load_font(MANROPE_SEMI, 18)


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def mix(left, right, amount):
    a = hex_rgb(left)
    b = hex_rgb(right)
    values = tuple(round(a[index] * (1 - amount) + b[index] * amount) for index in range(3))
    return "#" + "".join(f"{value:02x}" for value in values)


def make_gradient(size, accent):
    width, height = size
    top = hex_rgb(mix(CREAM, accent, 0.16))
    bottom = hex_rgb(CREAM)
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        ratio = min(1.0, y / max(1, height * 0.62))
        color = tuple(round(top[index] * (1 - ratio) + bottom[index] * ratio) for index in range(3))
        draw.line((0, y, width, y), fill=color)
    return image.convert("RGBA")


def draw_decor(base, accent):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    accent_rgb = hex_rgb(accent)
    draw.ellipse((930, -190, 1460, 340), fill=(*accent_rgb, 22))
    draw.ellipse((-260, 500, 260, 1020), fill=(*accent_rgb, 14))
    draw.arc((880, -110, 1390, 400), start=82, end=268, fill=(*accent_rgb, 54), width=3)
    draw.line((84, 118, 1200, 118), fill=(*hex_rgb(LINE), 130), width=2)
    base.alpha_composite(overlay)


def text_width(draw, value, font):
    bounds = draw.textbbox((0, 0), value, font=font)
    return bounds[2] - bounds[0]


def wrap_lines(draw, value, font, max_width):
    lines = []
    for paragraph in value.split("\n"):
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if text_width(draw, candidate, font) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def draw_wrapped(draw, xy, value, font, fill, max_width, spacing):
    x, y = xy
    lines = wrap_lines(draw, value, font, max_width)
    line_height = draw.textbbox((0, 0), "Ag", font=font)[3]
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height + spacing
    return y


def draw_multiline(draw, xy, value, font, fill, spacing):
    x, y = xy
    draw.multiline_text((x, y), value, font=font, fill=fill, spacing=spacing)
    bounds = draw.multiline_textbbox((x, y), value, font=font, spacing=spacing)
    return bounds[3]


def draw_pill(draw, xy, text, accent):
    x, y = xy
    width = text_width(draw, text, FONT_PROOF) + 48
    height = 50
    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=25,
        fill=mix(CREAM, accent, 0.22),
        outline=mix(CREAM, accent, 0.48),
        width=2,
    )
    draw.text((x + 24, y + 13), text, font=FONT_PROOF, fill=accent)
    return width


def rounded_image(image, radius):
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.paste(image, (0, 0), mask)
    return output


def place_device(base, screenshot):
    inner_width = 972
    inner_height = round(inner_width * screenshot.height / screenshot.width)
    inner_x = (base.width - inner_width) // 2
    inner_y = 690
    frame_padding = 15
    frame = (
        inner_x - frame_padding,
        inner_y - frame_padding,
        inner_x + inner_width + frame_padding,
        inner_y + inner_height + frame_padding,
    )

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (frame[0] - 6, frame[1] + 18, frame[2] + 6, frame[3] + 30),
        radius=82,
        fill=(55, 32, 25, 62),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    base.alpha_composite(shadow)

    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(frame, radius=82, fill=INK)

    resized = screenshot.resize((inner_width, inner_height), Image.Resampling.LANCZOS)
    clipped = rounded_image(resized, radius=67)
    base.alpha_composite(clipped, (inner_x, inner_y))


def draw_brand(base, draw):
    draw.text((82, 52), "our little world", font=FONT_BRAND, fill=TERRACOTTA)
    icon_path = ROOT / "assets" / "brand" / "icon.png"
    icon = Image.open(icon_path).convert("RGBA").resize((74, 74), Image.Resampling.LANCZOS)
    base.alpha_composite(icon, (1118, 40))


def render_slide(slide):
    source_path = SOURCE_DIR / slide["source"]
    if not source_path.exists():
        raise FileNotFoundError(f"Missing source capture: {source_path}")

    base = make_gradient(CANVAS_SIZE, slide["accent"])
    draw_decor(base, slide["accent"])
    draw = ImageDraw.Draw(base)
    draw_brand(base, draw)

    draw.text((82, 139), slide["eyebrow"], font=FONT_EYEBROW, fill=slide["accent"])
    headline_bottom = draw_multiline(
        draw,
        (82, 178),
        slide["headline"],
        FONT_HEADLINE,
        INK,
        spacing=3,
    )
    subhead_bottom = draw_wrapped(
        draw,
        (84, headline_bottom + 24),
        slide["subhead"],
        FONT_SUBHEAD,
        MUTED,
        max_width=1070,
        spacing=8,
    )
    pill_y = min(622, subhead_bottom + 22)
    draw_pill(draw, (84, pill_y), slide["proof"], slide["accent"])
    sample_text = "SAMPLE STORY · FAMILY PHOTOS USED WITH PERMISSION"
    sample_width = text_width(draw, sample_text, FONT_SAMPLE)
    draw.text((1200 - sample_width, pill_y + 16), sample_text, font=FONT_SAMPLE, fill=MUTED)

    screenshot = Image.open(source_path).convert("RGBA")
    place_device(base, screenshot)
    return base.convert("RGB")


def render_review_board(paths):
    board = Image.new("RGB", (1240, 1440), "#eee7e1")
    draw = ImageDraw.Draw(board)
    draw.text((54, 36), "Our Little World · iPhone 6.5 screenshot story", font=FONT_REVIEW_TITLE, fill=INK)
    thumb_width = 256
    thumb_height = round(thumb_width * CANVAS_SIZE[1] / CANVAS_SIZE[0])
    for index, path in enumerate(paths):
        column = index % 4
        row = index // 4
        x = 54 + column * 296
        y = 120 + row * 645
        image = Image.open(path).convert("RGB").resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        board.paste(image, (x, y))
        label = path.stem.replace("-", " ")
        draw.text((x, y + thumb_height + 12), label, font=FONT_REVIEW_LABEL, fill=MUTED)
    return board


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)

    for filename in LEGACY_IPHONE_FILES:
        path = OUT_DIR / filename
        if path.exists():
            path.unlink()

    paths = []
    for slide in SLIDES:
        output_path = OUT_DIR / f"{slide['name']}.png"
        render_slide(slide).save(output_path, "PNG", optimize=True)
        paths.append(output_path)

    review_path = REVIEW_DIR / "iphone-65-storyboard.png"
    render_review_board(paths).save(review_path, "PNG", optimize=True)

    print(f"Wrote {len(paths)} real-UI iPhone screenshots to {OUT_DIR}")
    print(f"Wrote review storyboard to {review_path}")
    print("iPad screenshots were intentionally left unchanged pending a real iPad UI capture.")


if __name__ == "__main__":
    main()
