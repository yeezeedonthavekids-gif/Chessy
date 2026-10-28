#!/usr/bin/env python3
"""Draws the 512x512 game icon (assets/game_icon.svg), reusing the thumbnail's art pieces."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import make_thumbnail as art  # noqa: E402

OUT = os.path.join(art.ROOT, "assets", "game_icon.svg")
S = 1024  # drawn at 1024 and rendered at 512 for crisp edges


def main():
    defs = """
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3fa4f2"/><stop offset="1" stop-color="#bfe6ff"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff6c8" stop-opacity="0.95"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="streak" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/>
  </linearGradient>
</defs>"""
    cx, cy, rx, ry = 230, 930, 470, 120
    rings = "".join(
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx * (1 - i / 6):.0f}" ry="{ry * (1 - i / 6):.0f}" fill="{"#76c853" if i % 2 == 0 else "#68b947"}"/>'
        for i in range(6)
    )
    island = f"""
<path d="M {cx - rx} {cy} L {cx + rx} {cy} L {cx + rx - 80} {cy + 120} L {cx} {cy + 200} L {cx - rx} {cy + 160} Z" fill="#8a5a3a" stroke="{art.INK}" stroke-width="8"/>
<ellipse cx="{cx}" cy="{cy + 26}" rx="{rx}" ry="{ry}" fill="#4f9a3c" stroke="{art.INK}" stroke-width="8"/>
{rings}
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{art.INK}" stroke-width="8"/>"""

    body = [
        defs,
        f'<rect width="{S}" height="{S}" fill="url(#sky)"/>',
        '<circle cx="900" cy="130" r="230" fill="url(#sun)"/>',
        '<circle cx="900" cy="130" r="64" fill="#fff3b0"/>',
        art.cloud(180, 330, 1.2, 0.9),
        art.cloud(860, 640, 1.1, 0.85),
        island,
        '<path d="M 470 760 L 650 520 L 705 565 L 510 800 Z" fill="url(#streak)"/>',
        '<path d="M 520 690 L 610 580" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.85"/>',
        art.character(215, 875, 2.0, 0, "#3d7bff", "#2f3a4f", "punch", "angry"),
        art.burst(470, 760, 105),
        art.character(690, 500, 2.2, 38, "#ff5a5f", "#3a2f4f", "fly", "shock"),
        art.heat_badge(330, 230, "187%").replace("font-size:84px", "font-size:150px").replace("stroke-width=\"14\"", "stroke-width=\"22\""),
    ]
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 {S} {S}">{"".join(body)}</svg>'
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(svg)
    print("wrote", os.path.relpath(OUT, art.ROOT))


if __name__ == "__main__":
    main()
