#!/usr/bin/env python3
"""Draws the game thumbnail (1920x1080) as assets/thumbnail.svg. Render: node tools/render_icons.cjs"""
import math
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets", "thumbnail.svg")
W, H = 1920, 1080
random.seed(7)

SKIN = "#f5cd30"
INK = "#1d2333"


def cloud(x, y, s, opacity=1.0):
    puffs = [(-60, 10, 48), (-15, -12, 62), (40, 0, 52), (85, 14, 38), (10, 22, 50)]
    circles = "".join(f'<circle cx="{x + px * s:.0f}" cy="{y + py * s:.0f}" r="{r * s:.0f}"/>' for px, py, r in puffs)
    return f'<g fill="#ffffff" opacity="{opacity}">{circles}<rect x="{x - 70 * s:.0f}" y="{y + 10 * s:.0f}" width="{170 * s:.0f}" height="{40 * s:.0f}" rx="{20 * s:.0f}"/></g>'


def mini_island(x, y, s):
    return f"""
<g transform="translate({x} {y}) scale({s})">
  <path d="M -120 0 L 120 0 L 70 60 L 20 120 L -10 90 L -50 70 Z" fill="#8a5a3a"/>
  <path d="M -120 0 L 120 0 L 112 14 L -112 14 Z" fill="#4f9a3c"/>
  <ellipse cx="0" cy="0" rx="122" ry="26" fill="#74c556"/>
  <rect x="34" y="-70" width="10" height="60" fill="#7a5235"/>
  <circle cx="39" cy="-82" r="30" fill="#5fae47"/>
</g>"""


def character(x, y, s, rot, shirt, pants, pose, face):
    """Blocky avatar. (x, y) = hips, pose: punch | fly | watch."""
    parts = []

    def limb(px, py, angle, w, h, color, hand=False):
        g = f'<g transform="rotate({angle} {px} {py})"><rect x="{px - w / 2}" y="{py}" width="{w}" height="{h}" rx="5" fill="{color}" stroke="{INK}" stroke-width="5"/>'
        if hand:
            g += f'<rect x="{px - w / 2 - 2}" y="{py + h - 4}" width="{w + 4}" height="{w + 2}" rx="6" fill="{SKIN}" stroke="{INK}" stroke-width="5"/>'
        return g + "</g>"

    if pose == "punch":
        legs = [(-14, 0, 14), (14, 0, -18)]
        arms = [(-36, -66, 30, False), (36, -66, -92, True)]
    elif pose == "fly":
        legs = [(-14, 0, 35), (14, 0, -25)]
        arms = [(-36, -66, 140, True), (36, -66, -150, True)]
    else:
        legs = [(-14, 0, 0), (14, 0, 0)]
        arms = [(-36, -66, 160, True), (36, -66, -160, True)]

    for lx, ly, a in legs:
        parts.append(limb(lx, ly, a, 26, 64, pants))
    parts.append(f'<rect x="-36" y="-72" width="72" height="76" rx="8" fill="{shirt}" stroke="{INK}" stroke-width="5"/>')
    for ax, ay, a, hand in arms:
        parts.append(limb(ax, ay, a, 22, 58 if hand else 66, SKIN if pose == "watch" else shirt, hand=hand or pose == "watch"))
    # head
    parts.append(f'<rect x="-27" y="-128" width="54" height="54" rx="14" fill="{SKIN}" stroke="{INK}" stroke-width="5"/>')
    if face == "angry":
        parts.append(f'<path d="M -17 -110 L -5 -105 M 17 -110 L 5 -105" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>')
        parts.append(f'<rect x="-15" y="-104" width="7" height="10" rx="3" fill="{INK}"/><rect x="8" y="-104" width="7" height="10" rx="3" fill="{INK}"/>')
        parts.append(f'<path d="M -11 -86 Q 0 -80 11 -88" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>')
    elif face == "shock":
        parts.append(f'<circle cx="-11" cy="-104" r="7" fill="#fff" stroke="{INK}" stroke-width="4"/><circle cx="11" cy="-104" r="7" fill="#fff" stroke="{INK}" stroke-width="4"/>')
        parts.append(f'<circle cx="-11" cy="-104" r="2.5" fill="{INK}"/><circle cx="11" cy="-104" r="2.5" fill="{INK}"/>')
        parts.append(f'<ellipse cx="0" cy="-86" rx="7" ry="9" fill="{INK}"/>')
    else:
        parts.append(f'<rect x="-14" y="-106" width="7" height="10" rx="3" fill="{INK}"/><rect x="7" y="-106" width="7" height="10" rx="3" fill="{INK}"/>')
        parts.append(f'<ellipse cx="0" cy="-86" rx="6" ry="5" fill="{INK}"/>')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">{"".join(parts)}</g>'


def burst(x, y, r):
    points = []
    for i in range(20):
        a = i / 20 * math.tau
        rr = r if i % 2 == 0 else r * 0.45
        rr *= random.uniform(0.85, 1.1)
        points.append(f"{x + math.cos(a) * rr:.0f},{y + math.sin(a) * rr:.0f}")
    inner = [f"{x + math.cos(i / 16 * math.tau) * (r * (0.55 if i % 2 == 0 else 0.3)):.0f},{y + math.sin(i / 16 * math.tau) * (r * (0.55 if i % 2 == 0 else 0.3)):.0f}" for i in range(16)]
    return (f'<polygon points="{" ".join(points)}" fill="#ffffff" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
            f'<polygon points="{" ".join(inner)}" fill="#ffd23f"/>')


def island():
    cx, cy, rx, ry = 760, 800, 690, 165
    rings = []
    colors = ["#76c853", "#68b947"]
    for i in range(7):
        k = 1 - i / 7
        rings.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx * k:.0f}" ry="{ry * k:.0f}" fill="{colors[i % 2]}"/>')
    underside = (f'M {cx - rx} {cy} L {cx + rx} {cy} L {cx + rx - 60} {cy + 90} L {cx + 420} {cy + 150} '
                 f'L {cx + 300} {cy + 260} L {cx + 120} {cy + 230} L {cx - 40} {cy + 330} L {cx - 220} {cy + 240} '
                 f'L {cx - 420} {cy + 190} L {cx - 580} {cy + 110} Z')
    return f"""
<path d="{underside}" fill="#8a5a3a" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="M {cx - 380} {cy + 150} L {cx - 300} {cy + 200} M {cx + 200} {cy + 170} L {cx + 260} {cy + 220} M {cx - 60} {cy + 230} L {cx - 30} {cy + 290}" stroke="#6b432a" stroke-width="10" stroke-linecap="round"/>
<ellipse cx="{cx}" cy="{cy + 22}" rx="{rx}" ry="{ry}" fill="#4f9a3c" stroke="{INK}" stroke-width="6"/>
<g>{"".join(rings)}</g>
<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{INK}" stroke-width="6"/>"""


def falling_tile(x, y, angle, s=1.0):
    return f"""
<g transform="translate({x} {y}) rotate({angle}) scale({s})">
  <path d="M -40 0 L 40 0 L 40 34 L -40 34 Z" fill="#8a5a3a" stroke="{INK}" stroke-width="5"/>
  <path d="M -40 0 L 40 0 L 40 12 L -40 12 Z" fill="#68b947" stroke="{INK}" stroke-width="5"/>
</g>"""


def title():
    text = "LAUNCH PARTY"
    style = "font-family:'Inter Display';font-weight:900;font-size:148px;letter-spacing:2px"
    return f"""
<g transform="translate(80 235) rotate(-4)">
  <text x="10" y="14" style="{style}" fill="{INK}" opacity="0.35">{text}</text>
  <text x="0" y="0" style="{style};paint-order:stroke" fill="url(#titleFill)" stroke="{INK}" stroke-width="22" stroke-linejoin="round">{text}</text>
</g>"""


def heat_badge(x, y, text):
    style = "font-family:'Inter Display';font-weight:900;font-size:84px"
    return f'<text x="{x}" y="{y}" text-anchor="middle" style="{style};paint-order:stroke" fill="#ff4a3d" stroke="{INK}" stroke-width="14" stroke-linejoin="round">{text}</text>'


def main():
    sky = """
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3fa4f2"/><stop offset="0.65" stop-color="#9fd6ff"/><stop offset="1" stop-color="#d9f0ff"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff6c8" stop-opacity="0.95"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="titleFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe45c"/><stop offset="1" stop-color="#ffab1a"/>
  </linearGradient>
  <linearGradient id="streak" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/>
  </linearGradient>
</defs>"""
    body = [sky, f'<rect width="{W}" height="{H}" fill="url(#sky)"/>',
            '<circle cx="1780" cy="120" r="240" fill="url(#sun)"/>', '<circle cx="1780" cy="120" r="64" fill="#fff3b0"/>']
    body += [cloud(1250, 640, 1.3, 0.9), cloud(330, 420, 0.9, 0.85), cloud(1700, 520, 1.0, 0.8), cloud(980, 150, 0.8, 0.7)]
    body += [mini_island(1560, 860, 0.9), mini_island(170, 600, 0.6)]
    body.append(island())

    # Crumbling edge on the right.
    body += [falling_tile(1405, 900, 18), falling_tile(1470, 990, -24, 0.9), falling_tile(1520, 1060, 40, 0.8)]

    # Bystander bot on the left, horrified.
    body.append(character(420, 730, 1.15, 0, "#58c98b", "#2f3a4f", "watch", "shock"))

    # Speed streak from the impact to the flying player.
    body.append('<path d="M 1090 600 L 1370 380 L 1405 425 L 1110 640 Z" fill="url(#streak)"/>')
    for offset in (-40, 30):
        body.append(f'<path d="M {1150 + offset} {565 + offset} L {1300 + offset} {450 + offset}" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.8"/>')

    # The puncher and the impact.
    body.append(character(840, 690, 1.6, 0, "#3d7bff", "#2f3a4f", "punch", "angry"))
    body.append(burst(1085, 600, 110))

    # The victim, launched.
    body.append(character(1470, 380, 1.5, 38, "#ff5a5f", "#3a2f4f", "fly", "shock"))
    body.append(heat_badge(1255, 305, "187%"))

    body.append(title())
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{"".join(body)}</svg>'
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(svg)
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
