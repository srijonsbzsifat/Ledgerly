#!/usr/bin/env python3
"""Regenerate the Ledgerly app icons from the ledger logo design.

Draws the same mark as components/Logo.tsx with PIL (no SVG renderer on
this machine): a ruled ledger page with a folded corner, red margin line
and column divider on an emerald gradient tile.

Outputs (all under public/):
  icons/icon-192.png, icons/icon-512.png  — "any" purpose, rounded tile
  icons/maskable-512.png                  — full-bleed, art inside the 80% safe zone
  apple-touch-icon.png (180x180)          — full-bleed, opaque
"""
import sys
from PIL import Image, ImageDraw, ImageOps

OUT = "/home/hatch/workspace/cash-dashboard/public"

ACCENT = (16, 185, 129)        # #10b981 emerald
ACCENT_STRONG = (4, 120, 87)   # #047857
ROSE = (244, 63, 94)           # #f43f5e
ZINC_200 = (228, 228, 231)     # #e4e4e7
WHITE = (255, 255, 255)


def diagonal_gradient(size, c1, c2):
    """Diagonal gradient (top-left c1 -> bottom-right c2), RGB image."""
    try:
        import numpy as np
    except ImportError:
        np = None
    if np is not None:
        y, x = np.mgrid[0:size, 0:size]
        t = ((x + y) / (2 * (size - 1))).astype(np.float32)
        arr = np.zeros((size, size, 3), dtype=np.uint8)
        for i in range(3):
            arr[:, :, i] = (c1[i] + (c2[i] - c1[i]) * t).astype(np.uint8)
        return Image.fromarray(arr, "RGB")
    # Fallback: vertical gradient rotated 45 degrees, centre-cropped.
    big = size * 2
    g = Image.linear_gradient("L").resize((big, big))
    g = g.rotate(45, resample=Image.BICUBIC)
    g = g.crop(((big - size) // 2, (big - size) // 2,
                (big + size) // 2, (big + size) // 2))
    return ImageOps.colorize(g, black=c1, white=c2)


def _round_line(draw, p1, p2, width, fill):
    draw.line([p1, p2], fill=fill, width=width)
    r = width / 2
    for (x, y) in (p1, p2):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def draw_ledger(img, scale, ox, oy):
    """Draw the ledger page art. (x, y) in the 64-grid map to
    (ox + x*scale, oy + y*scale). img is RGBA."""
    def X(v):
        return ox + v * scale

    def Y(v):
        return oy + v * scale

    draw = ImageDraw.Draw(img)
    # Page: white rounded rect with the folded top-right corner cut out.
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([X(15), Y(12), X(49), Y(52)], radius=3 * scale, fill=255)
    md.polygon([(X(40), Y(12)), (X(49), Y(21)), (X(40), Y(21))], fill=0)
    white = Image.new("RGBA", img.size, WHITE + (255,))
    img.paste(white, (0, 0), mask)
    # Folded corner.
    draw.polygon([(X(40), Y(12)), (X(49), Y(21)), (X(40), Y(21))], fill=ZINC_200 + (255,))
    # Red margin line, column divider, ruled lines.
    _round_line(draw, (X(21), Y(25)), (X(21), Y(45)), max(1, round(2 * scale)), ROSE + (255,))
    _round_line(draw, (X(37), Y(25)), (X(37), Y(45)), max(1, round(2 * scale)), ZINC_200 + (255,))
    for yy in (27, 34, 41):
        _round_line(draw, (X(24), Y(yy)), (X(45), Y(yy)),
                    max(1, round(2.5 * scale)), ACCENT + (255,))


def rounded_tile(size, radius_frac=15 / 64, ss=4):
    """Gradient tile with rounded corners on a transparent canvas (supersampled)."""
    big = size * ss
    grad = diagonal_gradient(big, ACCENT, ACCENT_STRONG).convert("RGBA")
    mask = Image.new("L", (big, big), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([big * 2 / 64, big * 2 / 64,
                          big * 62 / 64, big * 62 / 64],
                         radius=radius_frac * big, fill=255)
    grad.putalpha(mask)
    return grad


def make_any(size, path):
    ss = 4
    img = rounded_tile(size, ss=ss)
    draw_ledger(img, scale=(size * ss) / 64, ox=0, oy=0)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


def make_full_bleed(size, path, art_scale):
    """Opaque full-bleed gradient square; art scaled to art_scale, centred."""
    ss = 4
    big = size * ss
    grad = diagonal_gradient(big, ACCENT, ACCENT_STRONG).convert("RGBA")
    pad = (1 - art_scale) / 2
    draw_ledger(grad, scale=big * art_scale / 64, ox=big * pad, oy=big * pad)
    grad = grad.convert("RGB").resize((size, size), Image.LANCZOS)
    grad.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


def main():
    make_any(512, f"{OUT}/icons/icon-512.png")
    make_any(192, f"{OUT}/icons/icon-192.png")
    make_full_bleed(512, f"{OUT}/icons/maskable-512.png", art_scale=0.80)
    make_full_bleed(180, f"{OUT}/apple-touch-icon.png", art_scale=0.85)


if __name__ == "__main__":
    sys.exit(main())
