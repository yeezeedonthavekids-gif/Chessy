#!/usr/bin/env python3
"""Draws the developer product icons (512x512 SVGs) into assets/.

Render to PNG with: node tools/render_icons.cjs
"""
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets")

DEFS = """
<defs>
  <radialGradient id="bgBlue" cx="50%" cy="40%" r="65%">
    <stop offset="0" stop-color="#1f7fa8"/><stop offset="0.6" stop-color="#0f3f66"/><stop offset="1" stop-color="#0a1f3a"/>
  </radialGradient>
  <radialGradient id="bgWarm" cx="50%" cy="40%" r="65%">
    <stop offset="0" stop-color="#c2502a"/><stop offset="0.6" stop-color="#6e2318"/><stop offset="1" stop-color="#2a0c0e"/>
  </radialGradient>
  <radialGradient id="bgPurple" cx="50%" cy="40%" r="65%">
    <stop offset="0" stop-color="#7a3fc4"/><stop offset="0.6" stop-color="#3a1a6e"/><stop offset="1" stop-color="#140829"/>
  </radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f0a21e"/>
  </linearGradient>
  <radialGradient id="coin" cx="40%" cy="35%" r="70%">
    <stop offset="0" stop-color="#fff2a8"/><stop offset="0.55" stop-color="#ffcc33"/><stop offset="1" stop-color="#e08c10"/>
  </radialGradient>
  <linearGradient id="sack" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c48a52"/><stop offset="1" stop-color="#7a4a22"/>
  </linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#d7dee6"/><stop offset="0.5" stop-color="#9aa6b4"/><stop offset="1" stop-color="#5d6877"/>
  </linearGradient>
  <linearGradient id="molten" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#d6361f"/>
  </linearGradient>
  <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ffaa28"/><stop offset="1" stop-color="#ff3c96"/>
  </linearGradient>
  <linearGradient id="galaxy" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6a3cff"/><stop offset="0.5" stop-color="#b03cd6"/><stop offset="1" stop-color="#2b1470"/>
  </linearGradient>
  <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ff4a1c"/><stop offset="0.6" stop-color="#ffa21c"/><stop offset="1" stop-color="#fff07a"/>
  </linearGradient>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity="0.45"/>
  </filter>
</defs>
"""

FONT = "Arial Black, Arial, sans-serif"


def coin(x, y, r, tilt=0):
    return f"""
<g transform="translate({x} {y}) rotate({tilt})">
  <ellipse cx="0" cy="{r * 0.12:.1f}" rx="{r}" ry="{r}" fill="#b8720e"/>
  <circle cx="0" cy="0" r="{r}" fill="url(#coin)" stroke="#b8720e" stroke-width="{max(2, r * 0.07):.1f}"/>
  <circle cx="0" cy="0" r="{r * 0.74:.1f}" fill="none" stroke="#e8a21e" stroke-width="{max(2, r * 0.06):.1f}"/>
  <text x="0" y="{r * 0.36:.1f}" text-anchor="middle" font-family="{FONT}" font-weight="900"
        font-size="{r * 1.05:.1f}" fill="#b8720e">B</text>
</g>"""


def banner(text, y=418, width=250, fill="url(#gold)", color="#0f2a45"):
    x = 256 - width / 2
    return f"""
<g filter="url(#shadow)">
  <rect x="{x}" y="{y - 40}" width="{width}" height="74" rx="37" fill="{fill}" stroke="#7a4a0e" stroke-width="4"/>
  <text x="256" y="{y + 15}" text-anchor="middle" font-family="{FONT}" font-weight="900" font-size="46" fill="{color}">{text}</text>
</g>"""


def sack(x, y, s=1.0):
    return f"""
<g transform="translate({x} {y}) scale({s})" filter="url(#shadow)">
  <path d="M -62 -48 C -125 10 -118 128 0 128 C 118 128 125 10 62 -48 Z" fill="url(#sack)" stroke="#4f2e12" stroke-width="6"/>
  <path d="M -40 -50 L -66 -96 L -22 -74 L 0 -108 L 22 -74 L 66 -96 L 40 -50 Z" fill="url(#sack)" stroke="#4f2e12" stroke-width="6" stroke-linejoin="round"/>
  <rect x="-58" y="-62" width="116" height="20" rx="10" fill="url(#gold)" stroke="#7a4a0e" stroke-width="4"/>
  <circle cx="0" cy="44" r="40" fill="url(#gold)" stroke="#7a4a0e" stroke-width="5"/>
  <text x="0" y="62" text-anchor="middle" font-family="{FONT}" font-weight="900" font-size="50" fill="#7a4a0e">B</text>
</g>"""


def sparkle(x, y, r, color="#ffffff"):
    return (f'<path d="M {x} {y - r} Q {x} {y} {x + r} {y} Q {x} {y} {x} {y + r} '
            f'Q {x} {y} {x - r} {y} Q {x} {y} {x} {y - r} Z" fill="{color}"/>')


def svg(background, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{DEFS}'
            f'<rect width="512" height="512" fill="url(#{background})"/>{body}</svg>')


ICONS = {}

ICONS["bonks_100"] = svg("bgBlue", f"""
<g filter="url(#shadow)">
  {coin(196, 270, 70, -12)}
  {coin(318, 262, 70, 10)}
  {coin(256, 196, 82)}
</g>
{sparkle(380, 150, 18)}{sparkle(130, 170, 12)}
{banner("100")}""")

ICONS["bonks_550"] = svg("bgBlue", f"""
{sack(256, 210, 1.05)}
<g filter="url(#shadow)">
  {coin(130, 318, 46, -15)}
  {coin(384, 322, 46, 12)}
  {coin(352, 352, 36, -8)}
</g>
{sparkle(392, 130, 18)}{sparkle(120, 150, 13)}
{banner("550")}""")

ICONS["bonks_1200"] = svg("bgBlue", f"""
{sack(176, 218, 0.82)}
{sack(316, 196, 1.0)}
<g filter="url(#shadow)">
  {coin(104, 330, 42, -15)}
  {coin(150, 352, 36, 8)}
  {coin(402, 334, 44, 12)}
  {coin(256, 340, 40, 0)}
</g>
{sparkle(410, 100, 20)}{sparkle(96, 120, 14)}
{banner("1,200", width=280)}""")

ICONS["bonks_3000"] = svg("bgBlue", f"""
<g filter="url(#shadow)">
  <rect x="116" y="70" width="280" height="270" rx="34" fill="url(#steel)" stroke="#3b4553" stroke-width="8"/>
  <circle cx="256" cy="205" r="96" fill="#7d8896" stroke="#3b4553" stroke-width="8"/>
  <circle cx="256" cy="205" r="70" fill="url(#steel)" stroke="#3b4553" stroke-width="6"/>
  <g stroke="url(#gold)" stroke-width="16" stroke-linecap="round">
    <line x1="256" y1="150" x2="256" y2="260"/><line x1="201" y1="205" x2="311" y2="205"/>
    <line x1="217" y1="166" x2="295" y2="244"/><line x1="295" y1="166" x2="217" y2="244"/>
  </g>
  <circle cx="256" cy="205" r="22" fill="url(#gold)" stroke="#7a4a0e" stroke-width="5"/>
  <rect x="136" y="110" width="16" height="40" rx="6" fill="#5d6877"/>
  <rect x="136" y="260" width="16" height="40" rx="6" fill="#5d6877"/>
</g>
<g filter="url(#shadow)">
  {coin(110, 330, 46, -15)}{coin(160, 350, 40, 10)}
  {coin(402, 330, 46, 14)}{coin(352, 352, 40, -10)}
  {coin(256, 352, 44, 0)}
</g>
{sparkle(430, 90, 20)}{sparkle(80, 110, 14)}
{banner("3,000", width=280)}""")

ICONS["starter_bundle"] = svg("bgWarm", f"""
<g filter="url(#shadow)">
  <path d="M 256 40 C 300 90 316 120 300 150 C 296 128 284 118 276 112 C 282 140 270 160 256 170
           C 242 160 230 140 236 112 C 228 118 216 128 212 150 C 196 120 212 90 256 40 Z" fill="url(#flame)"/>
  <rect x="136" y="200" width="240" height="160" rx="16" fill="url(#molten)" stroke="#6e1a10" stroke-width="7"/>
  <rect x="124" y="164" width="264" height="54" rx="14" fill="url(#molten)" stroke="#6e1a10" stroke-width="7"/>
  <rect x="236" y="164" width="40" height="196" fill="url(#sunset)" stroke="#6e1a10" stroke-width="5"/>
  <path d="M 256 166 C 210 120 172 140 196 168 Z" fill="url(#sunset)" stroke="#6e1a10" stroke-width="5"/>
  <path d="M 256 166 C 302 120 340 140 316 168 Z" fill="url(#sunset)" stroke="#6e1a10" stroke-width="5"/>
</g>
<g filter="url(#shadow)">
  {coin(110, 326, 44, -15)}{coin(404, 330, 44, 14)}
</g>
{sparkle(410, 100, 18, "#ffe0a0")}{sparkle(98, 130, 13, "#ffe0a0")}
{banner("STARTER", width=300)}""")

ICONS["legend_bundle"] = svg("bgPurple", f"""
<g filter="url(#shadow)">
  <path d="M 196 98 L 214 46 L 238 80 L 256 36 L 274 80 L 298 46 L 316 98 Z" fill="url(#gold)" stroke="#7a4a0e" stroke-width="5" stroke-linejoin="round"/>
  <path d="M 120 210 C 120 140 392 140 392 210 Z" fill="url(#galaxy)" stroke="url(#gold)" stroke-width="10"/>
  <rect x="120" y="206" width="272" height="150" rx="14" fill="url(#galaxy)" stroke="url(#gold)" stroke-width="10"/>
  <rect x="120" y="248" width="272" height="16" fill="url(#gold)"/>
  <rect x="232" y="228" width="48" height="60" rx="10" fill="url(#gold)" stroke="#7a4a0e" stroke-width="5"/>
  <circle cx="256" cy="252" r="8" fill="#7a4a0e"/>
</g>
<g filter="url(#shadow)">
  {coin(104, 330, 44, -15)}{coin(150, 356, 36, 8)}
  {coin(408, 330, 44, 14)}{coin(362, 356, 36, -8)}
</g>
{sparkle(420, 120, 22, "#c9a6ff")}{sparkle(92, 150, 16, "#7ff0ff")}{sparkle(372, 60, 12, "#ffffff")}{sparkle(150, 70, 10, "#ffffff")}
{banner("LEGEND", width=300)}""")


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, content in ICONS.items():
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
