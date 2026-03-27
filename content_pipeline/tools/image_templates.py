"""
image_templates.py — Platform-specific image template rendering.

Generates branded image cards at the correct aspect ratio for each platform
using PIL/Pillow. No external image-generation API required.

Platform specs (industry-standard):
  twitter   → 1200 × 675   (16:9)
  linkedin  → 1200 × 627   (≈1.91:1)
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

# Default gradient pairs (top_color, bottom_color) per platform
_DEFAULT_GRADIENTS: dict[str, tuple[tuple[int, int, int], tuple[int, int, int]]] = {
    "twitter": ((14, 17, 20), (29, 161, 242)),       # X dark → blue
    "linkedin": ((0, 86, 143), (0, 160, 220)),        # LinkedIn navy → sky
    "instagram": ((131, 58, 180), (252, 176, 69)),    # IG purple → gold
}

# Where rendered images are saved
IMAGE_OUTPUT_DIR = Path(
    os.getenv("IMAGE_OUTPUT_DIR", str(Path(__file__).parent.parent / "generated_images"))
)


# ── Font helpers ───────────────────────────────────────────────────────────────

_WINDOWS_FONTS = [
    "C:/Windows/Fonts/arialbd.ttf",   # Arial Bold
    "C:/Windows/Fonts/Arial.ttf",
    "C:/Windows/Fonts/calibrib.ttf",  # Calibri Bold
    "C:/Windows/Fonts/calibri.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
]

_LINUX_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _WINDOWS_FONTS + _LINUX_FONTS:
        try:
            return ImageFont.truetype(path, size)
        except (IOError, OSError):
            continue
    # PIL built-in bitmap font — always available, fixed size
    return ImageFont.load_default()


# ── Drawing helpers ────────────────────────────────────────────────────────────


def _draw_gradient(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
) -> None:
    """Vertical linear gradient from top → bottom color."""
    for y in range(height):
        t = y / max(height - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))


def _draw_bottom_bar(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    bar_fraction: float = 0.20,
) -> int:
    """Draw a semi-transparent dark bar at the bottom. Returns bar y-start."""
    bar_y = int(height * (1 - bar_fraction))
    overlay = Image.new("RGBA", (width, height - bar_y), (0, 0, 0, 170))
    # We can't composite directly on a draw object; caller must handle this
    # Return y so the caller can composite after flattening
    return bar_y


def _wrap_text_to_lines(
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    max_width: int,
    draw: ImageDraw.ImageDraw,
) -> list[str]:
    """Greedy word-wrap that respects max_width in pixels."""
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        test = " ".join(current + [word])
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))
    return lines


# ── Public renderer ────────────────────────────────────────────────────────────


def render_image(
    platform: str,
    headline: str,
    company_name: str,
    output_path: Path,
    brand_colors: tuple[tuple[int, int, int], tuple[int, int, int]] | None = None,
) -> Path:
    """
    Render a branded image card for the given platform.

    Args:
        platform:     "twitter" | "linkedin" | "instagram"
        headline:     Short punchy text (≤ 12 words) for the card body
        company_name: Shown in the bottom bar
        output_path:  Where to save the PNG
        brand_colors: Optional (top_rgb, bottom_rgb) gradient override

    Returns:
        Path to the saved PNG file.
    """
    spec = PLATFORM_SPECS[platform]
    W, H = spec.width, spec.height

    top_color, bottom_color = brand_colors or _DEFAULT_GRADIENTS[platform]

    # ── Base canvas (RGB) ──────────────────────────────────────────────────────
    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)
    _draw_gradient(draw, W, H, top_color, bottom_color)

    # ── Bottom bar (RGBA composite) ────────────────────────────────────────────
    BAR_FRACTION = 0.22
    bar_y = int(H * (1 - BAR_FRACTION))

    bar_overlay = Image.new("RGBA", (W, H - bar_y), (0, 0, 0, 160))
    img_rgba = img.convert("RGBA")
    img_rgba.paste(bar_overlay, (0, bar_y), bar_overlay)
    img = img_rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    # ── Thin accent line above bottom bar ─────────────────────────────────────
    accent_color = (255, 255, 255, 80)
    draw.line([(0, bar_y), (W, bar_y)], fill=(200, 200, 200), width=1)

    # ── Padding constants ──────────────────────────────────────────────────────
    PAD_X = int(W * 0.07)         # horizontal padding
    PAD_TOP = int(H * 0.12)       # top padding for headline area
    text_area_w = W - 2 * PAD_X
    text_area_h = bar_y - PAD_TOP

    # ── Headline font — auto-size to fill the text area ───────────────────────
    headline = headline.strip().strip('"').strip("'")
    MAX_FONT = int(H * 0.12)
    MIN_FONT = int(H * 0.045)
    best_font = _load_font(MIN_FONT)
    best_lines: list[str] = [headline]

    for size in range(MAX_FONT, MIN_FONT - 1, -2):
        font = _load_font(size)
        lines = _wrap_text_to_lines(headline, font, text_area_w, draw)
        line_h = draw.textbbox((0, 0), "Ag", font=font)[3]
        total_h = line_h * len(lines) + int(line_h * 0.35) * (len(lines) - 1)
        if total_h <= text_area_h * 0.85:
            best_font = font
            best_lines = lines
            break

    # ── Draw headline (centered vertically in text area) ──────────────────────
    line_h = draw.textbbox((0, 0), "Ag", font=best_font)[3]
    gap = int(line_h * 0.35)
    block_h = line_h * len(best_lines) + gap * (len(best_lines) - 1)
    start_y = PAD_TOP + (text_area_h - block_h) // 2

    for i, line in enumerate(best_lines):
        bbox = draw.textbbox((0, 0), line, font=best_font)
        line_w = bbox[2] - bbox[0]
        x = (W - line_w) // 2
        y = start_y + i * (line_h + gap)
        # Shadow for legibility
        draw.text((x + 2, y + 2), line, font=best_font, fill=(0, 0, 0, 120))
        draw.text((x, y), line, font=best_font, fill=(255, 255, 255))

    # ── Bottom bar: company name (left) + platform label (right) ──────────────
    bar_font_size = max(int(H * 0.035), 14)
    bar_font = _load_font(bar_font_size)
    bar_text_y = bar_y + int((H - bar_y - bar_font_size) // 2)

    draw.text(
        (PAD_X, bar_text_y),
        company_name,
        font=bar_font,
        fill=(255, 255, 255),
    )

    label_text = spec.label
    label_bbox = draw.textbbox((0, 0), label_text, font=bar_font)
    label_w = label_bbox[2] - label_bbox[0]
    draw.text(
        (W - PAD_X - label_w, bar_text_y),
        label_text,
        font=bar_font,
        fill=(220, 220, 220),
    )

    # ── Thin white border frame ────────────────────────────────────────────────
    draw.rectangle([(2, 2), (W - 3, H - 3)], outline=(255, 255, 255, 60), width=2)

    # ── Save ──────────────────────────────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "PNG", optimize=True)
    return output_path
