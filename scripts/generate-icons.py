#!/usr/bin/env python3
"""Regenerate the Ledgerly app icons from the 3D wallet logo.

Source: docs/logo-options/logo-wallet-gold-bright.webp — Sifat's final pick
(2026-11-17): a LARGE bright glossy emerald wallet, slightly open, with a
gold card sliding out and a gold $ coin on the front, on a DARK navy
background (the dark outline Sifat asked to keep).
(History: the first wallet, logo-wallet.webp, was small in the frame with
gold; the clean version, logo-wallet-clean.webp, removed the gold; Sifat
then picked the enlarged wallet WITH gold (logo-wallet-gold-big.webp),
then found it too dark next to MyLedger's bright cube, so it was relit
brighter (logo-wallet-gold-bright.webp); the background then went deep
emerald (logo-wallet-gold-bright-emerald.webp) and bright vivid emerald
(logo-wallet-gold-bright-green-bg.webp) — but Sifat found the bright
emerald background looked very bad in the tab and asked to keep the wallet
with the dark outline like before, so the bright wallet on dark navy is
the final mark. Simple cube/L alternatives (logo-plain-cube2.webp,
logo-gold-base-cube2.webp, logo-bold-l2.webp) were offered and passed over
in favour of the wallet. The earlier version of this script drew the flat
SVG ledger mark with PIL; that art is retired — components/Logo.tsx now
uses public/logo-3d.png.)

Outputs (all under public/):
  logo-3d.png (512x512)                 — loading-screen centre
  icons/icon-192.png, icons/icon-512.png — "any" purpose
  icons/maskable-512.png                — full-bleed, art scaled to 72% so it
                                          sits inside the 80% maskable safe zone
  apple-touch-icon.png (180x180)        — full-bleed, opaque
  favicon.png (48x48)                   — browser tab icon
"""
import os

from PIL import Image

BASE = "/home/hatch/workspace/cash-dashboard"
SRC = os.path.join(BASE, "docs/logo-options/logo-wallet-gold-bright.webp")
OUT = os.path.join(BASE, "public")
BG = (11, 12, 25)  # the source image's corner background colour (dark navy)


def main():
    src = Image.open(SRC).convert("RGB")
    print("source:", src.size)

    # Loader art at 512.
    logo = src.resize((512, 512), Image.LANCZOS)
    logo.save(os.path.join(OUT, "logo-3d.png"), optimize=True)

    # "any" icons: the full tile, resized.
    for size, name in ((192, "icons/icon-192.png"), (512, "icons/icon-512.png")):
        src.resize((size, size), Image.LANCZOS).save(
            os.path.join(OUT, name), optimize=True
        )

    # Maskable: scale the art to 72% and centre it on the background colour,
    # so the wallet stays inside the 80% safe circle on any mask shape.
    canvas = Image.new("RGB", (512, 512), BG)
    art = src.resize((368, 368), Image.LANCZOS)  # 72% of 512
    canvas.paste(art, ((512 - 368) // 2, (512 - 368) // 2))
    canvas.save(os.path.join(OUT, "icons/maskable-512.png"), optimize=True)

    # Apple touch icon + favicon: full tile, resized.
    src.resize((180, 180), Image.LANCZOS).save(
        os.path.join(OUT, "apple-touch-icon.png"), optimize=True
    )
    src.resize((48, 48), Image.LANCZOS).save(
        os.path.join(OUT, "favicon.png"), optimize=True
    )

    for f in (
        "logo-3d.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",
        "apple-touch-icon.png",
        "favicon.png",
    ):
        p = os.path.join(OUT, f)
        print(f"  {f}: {os.path.getsize(p):,} bytes")


if __name__ == "__main__":
    main()
