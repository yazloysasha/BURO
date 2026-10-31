#!/usr/bin/env python3
"""Builds cat atlases from LuizMelo 'Pet Cats Pack' (CC0) and kotnaszynce 'cute kitty animated set' (CC0).
Run: python3 build_cats.py <raw_extracted_dir> <BURO/assets>   (raw dir = folder with extracted packs)
Пепося  = Cat-1 (ginger) pushed to a brighter orange.  Дудоня = Cat-6 (grey tabby) + generated pink bow.
"""
import sys, os, json, colorsys
from PIL import Image
RAW, OUT = sys.argv[1], sys.argv[2]
P = os.path.join(RAW, "pet_cats_pack/Pet Cats Pack")
D = os.path.join(OUT, "sprites/cats"); os.makedirs(D, exist_ok=True)
FW = FH = 32; CROP = (9, 0, 41, 32)   # from 50x50 source frame; union bbox of all cats is x10..40, y15..32
ANIMS = [  # (atlas key, source file suffix, fps suggestion)
    ("idle", "Idle", 8), ("walk", "Walk", 10), ("run", "Run", 12), ("sit", "Sitting", 1),
    ("sleep1", "Sleeping1", 1), ("sleep2", "Sleeping2", 1), ("lay", "Laying", 8), ("meow", "Meow", 8),
    ("itch", "Itch", 6), ("lick1", "Licking 1", 8), ("lick2", "Licking 2", 8), ("stretch", "Stretching", 10)]
SKINS = {1: "ginger", 2: "black", 3: "siamese", 4: "sphynx", 5: "white_fluffy", 6: "grey_tabby"}

def strip(cat, suffix):
    if not os.path.exists(f"{P}/Cat-{cat}/Cat-{cat}-{suffix}.png"): return []
    im = Image.open(f"{P}/Cat-{cat}/Cat-{cat}-{suffix}.png").convert("RGBA")
    return [im.crop((i * 50 + CROP[0], CROP[1], i * 50 + CROP[2], CROP[3])) for i in range(im.width // 50)]

def recolor_orange(im):
    px = im.load(); out = im.copy(); po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.25 and 0.04 < h < 0.2:           # mustard/brown fur -> warm orange
                h = max(0.0, h - 0.045); s = min(1, s * 1.35); v = min(1, v * 1.12)
                r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(h, s, v)]
            po[x, y] = (r, g, b, a)
    return out

BOW = ["LL.LL", "LDKDL", ".L.L."]
BOWC = {"L": (255, 140, 190, 255), "D": (226, 88, 150, 255), "K": (160, 40, 100, 255)}
def add_bow(im, small=False):
    out = im.copy(); a = out.split()[3]; bb = a.getbbox()
    if not bb: return out
    pts = [(x, y) for y in range(bb[1], bb[3]) for x in range(bb[0], bb[2]) if a.getpixel((x, y)) > 0]
    # locate the head via the yellow eye pixel (232,216,42) if visible, else rightmost 40% of silhouette
    eyes = [p for p in pts if out.getpixel(p)[:3] == (232, 216, 42)]
    if eyes:
        ex = min(p[0] for p in eyes); ey = min(p[1] for p in eyes)
        head = [p for p in pts if ex - 3 <= p[0] <= ex + 3 and p[1] <= ey]
    else:
        xr = bb[0] + int((bb[2] - bb[0]) * 0.6)
        head = [p for p in pts if p[0] >= xr] or pts
    ytop = min(p[1] for p in head)
    ear = min(p[0] for p in head if p[1] <= ytop + 1)
    pat = ["L.L", "LKL"] if small else BOW
    w = len(pat[0]); ox = ear - w // 2 - (0 if small else 1); oy = ytop - (1 if small else 1)
    for j, row in enumerate(pat):
        for i, ch in enumerate(row):
            X, Y = ox + i, oy + j
            if ch != "." and 0 <= X < out.width and 0 <= Y < out.height:
                out.putpixel((X, Y), BOWC[ch])
    return out

def tint(im, rgb, k):
    out = im.copy(); px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a: px[x, y] = (int(r + (rgb[0] - r) * k), int(g + (rgb[1] - g) * k), int(b + (rgb[2] - b) * k), a)
    return out

def build(name, cat, fx=None, bow=False, outdir=None):
    outdir = outdir or D
    rows = []
    for key, suf, fps in ANIMS:
        fr = strip(cat, suf)
        if not fr: continue
        if fx: fr = [fx(f) for f in fr]
        if bow: fr = [add_bow(f) for f in fr]
        rows.append((key, fr, fps, f"Cat-{cat}-{suf}.png"))
    idle0 = rows[0][1][0]
    rows.append(("hurt", [tint(idle0, (255, 60, 60), 0.55), tint(idle0, (255, 255, 255), 0.85)], 12, "GENERATED (tint of idle frame 0)"))
    cols = max(len(r[1]) for r in rows)
    sheet = Image.new("RGBA", (cols * FW, len(rows) * FH))
    meta = {"image": f"{name}.png", "frameW": FW, "frameH": FH, "facing": "right", "source_cat": f"Cat-{cat}",
            "anchor": "bottom-center; feet on row y=31", "animations": {}}
    for ri, (key, fr, fps, src) in enumerate(rows):
        for ci, f in enumerate(fr): sheet.alpha_composite(f, (ci * FW, ri * FH))
        meta["animations"][key] = {"row": ri, "frames": len(fr), "fps": fps, "y": ri * FH, "source": src}
    meta["aliases"] = {"attack": {"use": "run", "frames": [2, 3, 4, 5], "note": "no attack anim in pack; lunge = run frames + code tween"},
                       "taunt": {"use": "meow"}, "special": {"use": "stretch"}, "rest": {"use": "sleep1"}, "victory": {"use": "lick1"}}
    sheet.save(f"{outdir}/{name}.png")
    json.dump(meta, open(f"{outdir}/{name}.json", "w"), indent=1)
    return sheet

build("peposya", 1, fx=recolor_orange)
build("dudonya", 6, bow=True)
os.makedirs(f"{D}/skins", exist_ok=True)
for n, s in SKINS.items():
    build(f"skin_{s}", n, outdir=f"{D}/skins")
Image.open(f"{P}/Meow-VFX/Meow-VFX.png").save(f"{D}/meow_vfx.png")
json.dump({"image": "meow_vfx.png", "frameW": 16, "frameH": 16, "frames": 3, "fps": 8}, open(f"{D}/meow_vfx.json", "w"), indent=1)

# ---- 16x16 mini cats from kotnaszynce "cute kitty animated set" (dark-brown original)
# OGA page lists zips as 1=Idle, 2=Walking/jumping, 3=Death, 4=Attack
K = [("idle", "1_5", ["kitkus 16x16 1.png", "kitkus 16x16 2.png", "kitkus 16x16 3.png", "kitkus 16x16 4.png"]),
     ("walk_jump", "2_0", ["kitkus 16x16 2 1.png", "kitkus 16x16 2 2.png", "kitkus 16x16 2 3.png"]),
     ("death", "3_0", ["kitkus 16x16 3 1.png", "kitkus 16x16 3 2.png", "kitkus 16x16 3 3.png"]),
     ("attack", "4", [f"kitkus 16x16 3 {i}.png" for i in range(1, 7)])]
def ramp(im, outline, lo, hi):
    out = im.copy(); px = out.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            if not a: continue
            if r > 200 and g > 200: continue                     # keep eyes / sparkles
            if (r, g, b) == (41, 8, 0): px[x, y] = outline + (a,); continue
            t = max(0, min(1, (r - 60) / 50))
            px[x, y] = tuple(int(lo[i] + (hi[i] - lo[i]) * t) for i in range(3)) + (a,)
    return out
VARS = {"mini_original": None,
        "mini_peposya": lambda f: ramp(f, (90, 40, 10), (205, 105, 35), (245, 160, 70)),
        "mini_dudonya": lambda f: add_bow(ramp(f, (45, 45, 55), (115, 115, 125), (175, 175, 185)), small=True)}
for vname, fx in VARS.items():
    sheet = Image.new("RGBA", (6 * 16, 4 * 16)); meta = {"image": f"{vname}.png", "frameW": 16, "frameH": 16, "facing": "right", "animations": {}}
    for ri, (key, folder, files) in enumerate(K):
        for ci, fn in enumerate(files):
            f = Image.open(os.path.join(RAW, folder, fn)).convert("RGBA")
            if fx: f = fx(f)
            sheet.alpha_composite(f, (ci * 16, ri * 16))
        meta["animations"][key] = {"row": ri, "frames": len(files), "fps": 8, "y": ri * 16}
    sheet.save(f"{D}/{vname}.png"); json.dump(meta, open(f"{D}/{vname}.json", "w"), indent=1)
print("cats done")
