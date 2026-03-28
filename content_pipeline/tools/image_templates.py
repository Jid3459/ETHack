"""
image_templates.py — Branded image card renderer.

Design (matches modern social-media brand card style):
  - White base canvas with diagonal colour-streak overlays
  - Large floating card: deep blue gradient, rounded corners, drop-shadow
  - Brand identity row at card top  (Company | tagline)
  - Bold ALL-CAPS headline:  accent colour lines + white final line
  - Platform label badge bottom-right inside the card

Platform specs (industry standard):
  twitter   → 1200 × 675   (16:9)
  linkedin  → 1200 × 627   (≈ 1.91:1)
  instagram → 1080 × 1080  (1:1)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import NamedTuple

from PIL import Image, ImageDraw, ImageFont

# ── Platform specs ─────────────────────────────────────────────────────────────


class PlatformSpec(NamedTuple):
    width: int
    height: int
    aspect_ratio: str
    label: str


PLATFORM_SPECS: dict[str, PlatformSpec] = {
    "twitter": PlatformSpec(1200, 675, "16:9", "X / Twitter"),
    "linkedin": PlatformSpec(1200, 627, "1.91:1", "LinkedIn"),
    "instagram": PlatformSpec(1080, 1080, "1:1", "Instagram"),
}

SUPPORTED_PLATFORMS: set[str] = set(PLATFORM_SPECS.keys())

# ── Design constants ───────────────────────────────────────────────────────────

# Card gradient: sky-blue top → deep indigo bottom
_CARD_TOP    = (120, 190, 255)   # #78BEff
_CARD_BOTTOM = (28,  22,  120)   # #1C1678

# Headline text colours
_TEXT_ACCENT = (186, 255,  62)   # #BAFF3E  lime / neon
_TEXT_WHITE  = (255, 255, 255)

# Diagonal streaks: (colour_rgba)  drawn as parallelograms
_STREAKS = [
    (70,  145, 255,  30),   # soft blue — left cluster
    (130,  70, 255,  18),   # purple    — left cluster
    ( 55, 195, 195,  22),   # teal      — right cluster
    ( 75, 130, 255,  28),   # sky blue  — right cluster
    (150,  80, 255,  14),   # violet    — far right
]

# Streak x-centre positions as fractions of image width (bottom edge)
_STREAK_X_FRACS  = [0.08, 0.18, 0.80, 0.91, 0.99]
# How wide each streak is (fraction of image width)
_STREAK_W_FRACS  = [0.11, 0.07, 0.13, 0.08, 0.06]
# Tilt factor: top of streak shifts this fraction of H to the right
_STREAK_TILT = 0.55

# Card corner radius (pixels)
_CARD_RADIUS = 32

# Output directory
IMAGE_OUTPUT_DIR = Path(
    os.getenv("IMAGE_OUTPUT_DIR",
              str(Path(__file__).parent.parent / "generated_images"))
)


# ── Font loading ───────────────────────────────────────────────────────────────

_HEAVY_FONTS = [        # for headline — need heavy weight
    "C:/Windows/Fonts/impact.ttf",
    "C:/Windows/Fonts/ariblk.ttf",       # Arial Black
    "C:/Windows/Fonts/seguibl.ttf",      # Segoe UI Black
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

_REGULAR_FONTS = [      # for brand row
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/calibrib.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _load_font(
    size: int,
    candidates: list[str] = _HEAVY_FONTS,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    return ImageFont.load_default()


# ── Drawing helpers ────────────────────────────────────────────────────────────


def _draw_streaks(base: Image.Image, W: int, H: int) -> Image.Image:
    """Overlay diagonal coloured parallelogram streaks on a white canvas."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)
    tilt    = int(H * _STREAK_TILT)

    for i, color in enumerate(_STREAKS):
        cx  = int(W * _STREAK_X_FRACS[i])
        sw  = int(W * _STREAK_W_FRACS[i])
        x_bl = cx - sw // 2
        x_br = cx + sw // 2
        # top of streak is shifted right by tilt
        polygon = [
            (x_bl,        H),
            (x_br,        H),
            (x_br + tilt, 0),
            (x_bl + tilt, 0),
        ]
        draw.polygon(polygon, fill=color)

    return Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB")


def _make_gradient(
    w: int, h: int,
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
) -> Image.Image:
    """Return an RGB image filled with a vertical linear gradient."""
    img  = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def _paste_rounded(
    base_rgba: Image.Image,
    src: Image.Image,
    xy: tuple[int, int],
    radius: int,
) -> None:
    """Paste *src* onto *base_rgba* with a rounded-rectangle mask."""
    w, h     = src.size
    src_rgba = src.convert("RGBA")
    mask     = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [(0, 0), (w - 1, h - 1)], radius=radius, fill=255
    )
    src_rgba.putalpha(mask)
    base_rgba.paste(src_rgba, xy, src_rgba)


def _drop_shadow(
    base_rgba: Image.Image,
    rect: tuple[int, int, int, int],
    offset: int = 10,
    radius: int = _CARD_RADIUS,
) -> None:
    """Paint a semi-transparent dark shadow beneath the card rect."""
    x0, y0, x1, y1 = rect
    shadow = Image.new("RGBA", base_rgba.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [(x0 + offset, y0 + offset), (x1 + offset, y1 + offset)],
        radius=radius,
        fill=(0, 0, 40, 70),
    )
    base_rgba.paste(shadow, (0, 0), shadow)


def _wrap_lines(
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_px: int,
    draw: ImageDraw.ImageDraw,
) -> list[str]:
    """Greedy word-wrap; returns list of lines that each fit within max_px."""
    words, lines, current = text.split(), [], []
    for word in words:
        test = " ".join(current + [word])
        if draw.textbbox((0, 0), test, font=font)[2] <= max_px:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines or [text]


def _text_w(
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    draw: ImageDraw.ImageDraw,
) -> int:
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]


def _text_h(
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    draw: ImageDraw.ImageDraw,
) -> int:
    return draw.textbbox((0, 0), "Ag", font=font)[3]


# ── Brand-colour extraction from profile ──────────────────────────────────────


def _resolve_brand_colors(
    profile: dict,
) -> tuple[
    tuple[int, int, int],   # card gradient top
    tuple[int, int, int],   # card gradient bottom
    tuple[int, int, int],   # accent / highlight colour
]:
    """
    Pull brand colours from company profile if available.

    Expected profile keys (all optional):
      "brand_colors": {
          "primary":   "#1a56db",   → card top
          "secondary": "#0e1b4d",   → card bottom
          "accent":    "#baff3e"    → headline accent
      }
    Falls back to the default blue-indigo + lime palette.
    """
    def _hex(h: str) -> tuple[int, int, int]:
        h = h.lstrip("#")
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    bc = profile.get("brand_colors", {})
    try:
        top    = _hex(bc["primary"])    if "primary"   in bc else _CARD_TOP
        bottom = _hex(bc["secondary"]) if "secondary" in bc else _CARD_BOTTOM
        accent = _hex(bc["accent"])    if "accent"    in bc else _TEXT_ACCENT
        return top, bottom, accent
    except (ValueError, KeyError):
        return _CARD_TOP, _CARD_BOTTOM, _TEXT_ACCENT


# ── Public renderer ────────────────────────────────────────────────────────────


def render_image(
    platform: str,
    headline: str,
    company_name: str,
    output_path: Path,
    tagline: str = "",
    brand_colors: tuple | None = None,
    profile: dict | None = None,
) -> Path:
    """
    Render a branded social-media image card and save it as PNG.

    Args:
        platform:     "twitter" | "linkedin" | "instagram"
        headline:     Short punchy text (≤ 10 words) — rendered ALL CAPS
        company_name: Shown in the brand row inside the card
        output_path:  Where to save the PNG
        tagline:      Optional sub-brand string (e.g. industry or event name)
        brand_colors: (card_top_rgb, card_bottom_rgb, accent_rgb) override
        profile:      Full company profile dict — used to extract brand_colors

    Returns:
        Path to the saved PNG.
    """
    spec = PLATFORM_SPECS[platform]
    W, H = spec.width, spec.height

    # ── Resolve colours ────────────────────────────────────────────────────────
    if brand_colors and len(brand_colors) == 3:
        card_top, card_bot, accent = brand_colors
    elif profile:
        card_top, card_bot, accent = _resolve_brand_colors(profile)
    else:
        card_top, card_bot, accent = _CARD_TOP, _CARD_BOTTOM, _TEXT_ACCENT

    # ── Base: white canvas ─────────────────────────────────────────────────────
    base = Image.new("RGB", (W, H), (255, 255, 255))
    base = _draw_streaks(base, W, H)

    # ── Card geometry ──────────────────────────────────────────────────────────
    MARGIN_X  = int(W * 0.052)
    MARGIN_Y  = int(H * 0.072)
    card_x0   = MARGIN_X
    card_y0   = MARGIN_Y
    card_x1   = W - MARGIN_X
    card_y1   = H - MARGIN_Y
    card_w    = card_x1 - card_x0
    card_h    = card_y1 - card_y0

    # Brand row = top 18 % of card
    BRAND_FRAC   = 0.18
    brand_row_h  = int(card_h * BRAND_FRAC)
    sep_y        = card_y0 + brand_row_h          # separator line y
    text_y0      = sep_y + 4                      # headline area starts here
    text_area_h  = card_y1 - text_y0

    # ── Drop shadow ────────────────────────────────────────────────────────────
    base_rgba = base.convert("RGBA")
    _drop_shadow(base_rgba, (card_x0, card_y0, card_x1, card_y1))

    # ── Card gradient ──────────────────────────────────────────────────────────
    card_img = _make_gradient(card_w, card_h, card_top, card_bot)
    _paste_rounded(base_rgba, card_img, (card_x0, card_y0), _CARD_RADIUS)

    # Work on the full image from here
    img  = base_rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    # ── Brand row: company name | tagline ─────────────────────────────────────
    brand_font_size = max(int(brand_row_h * 0.32), 14)
    brand_font      = _load_font(brand_font_size, _REGULAR_FONTS)

    name_text = company_name.upper()
    tag_text  = tagline.upper() if tagline else spec.label.upper()

    # Separator pipe
    sep_text  = "  |  "
    name_x    = card_x0 + int(card_w * 0.06)
    brand_y   = card_y0 + (brand_row_h - _text_h(brand_font, draw)) // 2

    draw.text((name_x, brand_y), name_text, font=brand_font, fill=_TEXT_WHITE)
    name_end = name_x + _text_w(name_text, brand_font, draw)
    draw.text((name_end, brand_y), sep_text, font=brand_font,
              fill=(200, 200, 200))
    sep_end = name_end + _text_w(sep_text, brand_font, draw)
    draw.text((sep_end, brand_y), tag_text, font=brand_font,
              fill=(200, 200, 200))

    # ── Separator line ─────────────────────────────────────────────────────────
    draw.line(
        [(card_x0 + int(card_w * 0.05), sep_y),
         (card_x1 - int(card_w * 0.05), sep_y)],
        fill=(255, 255, 255, 60),
        width=1,
    )

    # ── Headline text ──────────────────────────────────────────────────────────
    headline_upper = headline.upper().strip().strip('"').strip("'")
    TEXT_PAD_X     = int(card_w * 0.07)
    text_max_w     = card_w - 2 * TEXT_PAD_X

    # Auto-size font: find largest size where wrapped text fits the area
    MAX_SIZE = int(H * 0.18)
    MIN_SIZE = int(H * 0.050)
    chosen_font  = _load_font(MIN_SIZE)
    chosen_lines: list[str] = [headline_upper]

    for size in range(MAX_SIZE, MIN_SIZE - 1, -2):
        font  = _load_font(size)
        lines = _wrap_lines(headline_upper, font, text_max_w, draw)
        lh    = _text_h(font, draw)
        gap   = int(lh * 0.18)
        total = lh * len(lines) + gap * (len(lines) - 1)
        if total <= int(text_area_h * 0.90):
            chosen_font  = font
            chosen_lines = lines
            break

    # Compute block height and centre vertically in text area
    lh    = _text_h(chosen_font, draw)
    gap   = int(lh * 0.18)
    block = lh * len(chosen_lines) + gap * (len(chosen_lines) - 1)
    start_y = text_y0 + (text_area_h - block) // 2

    for i, line in enumerate(chosen_lines):
        # Last line → white; all others → accent
        color = _TEXT_WHITE if i == len(chosen_lines) - 1 else accent
        lw    = _text_w(line, chosen_font, draw)
        x     = card_x0 + (card_w - lw) // 2           # horizontally centred
        y     = start_y + i * (lh + gap)
        # Subtle shadow for depth
        draw.text((x + 3, y + 3), line, font=chosen_font, fill=(0, 0, 0, 90))
        draw.text((x, y), line, font=chosen_font, fill=color)

    # ── Platform badge — bottom-right inside card ──────────────────────────────
    badge_font_size = max(int(brand_row_h * 0.26), 12)
    badge_font      = _load_font(badge_font_size, _REGULAR_FONTS)
    badge_text      = spec.label
    badge_w         = _text_w(badge_text, badge_font, draw)
    badge_pad_x     = int(card_w * 0.06)
    badge_pad_y     = int(card_h * 0.04)
    draw.text(
        (card_x1 - badge_w - badge_pad_x, card_y1 - _text_h(badge_font, draw) - badge_pad_y),
        badge_text,
        font=badge_font,
        fill=(200, 200, 200),
    )

    # ── Save ──────────────────────────────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "PNG", optimize=True)
    return output_path
