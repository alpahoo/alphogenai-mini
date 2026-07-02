"""
Generate the catalog podcast persona portraits (T-1136-seed).

Stylized, AlphoGen-owned flat illustrations (NOT real people) written to
public/podcast-personas/*.png, served by Vercel at
https://www.alphogen.com/podcast-personas/<slug>.png and referenced by
supabase/seeds/podcast_personas_catalog_seed.sql.

Palettes are deliberately NOT the host-green / guest-blue placeholder colors, so
a rendered avatar in these tones visually confirms the persona (non-fallback)
render path.

Run:  python scripts/gen_podcast_catalog_portraits.py
"""
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "podcast-personas")
S = 512


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


PERSONAS = [
    ("maya-rivers", (124, 58, 237), (237, 233, 254)),   # violet
    ("leo-bennett", (217, 119, 6), (254, 243, 199)),    # amber
    ("aria-chen", (13, 148, 136), (204, 251, 241)),     # teal
    ("sam-delgado", (219, 39, 119), (252, 231, 243)),   # rose
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, base, light in PERSONAS:
        img = Image.new("RGB", (S, S), light)
        d = ImageDraw.Draw(img)
        for y in range(S):
            d.line([(0, y), (S, y)], fill=mix(light, mix(base, (255, 255, 255), 0.55), y / S))
        d.ellipse([S * 0.12, S * 0.10, S * 0.88, S * 0.86], fill=mix(base, (255, 255, 255), 0.30))
        d.rounded_rectangle([S * 0.22, S * 0.66, S * 0.78, S * 1.02], radius=int(S * 0.16),
                            fill=mix(base, (20, 24, 34), 0.15))
        skin = mix(base, (250, 250, 252), 0.62)
        d.ellipse([S * 0.34, S * 0.30, S * 0.66, S * 0.64], fill=skin,
                  outline=mix(base, (10, 12, 20), 0.30), width=4)
        d.pieslice([S * 0.33, S * 0.28, S * 0.67, S * 0.60], 180, 360, fill=mix(base, (15, 18, 28), 0.25))
        d.arc([S * 0.42, S * 0.44, S * 0.58, S * 0.60], 20, 160, fill=mix(base, (10, 12, 20), 0.35), width=4)
        d.ellipse([S * 0.10, S * 0.08, S * 0.90, S * 0.88], outline=base, width=8)
        img.save(os.path.join(OUT, slug + ".png"), "PNG")
        print("wrote", os.path.join(OUT, slug + ".png"))


if __name__ == "__main__":
    main()
