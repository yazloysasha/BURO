#!/usr/bin/env python3
"""slice_sheets.py - describe a uniform-grid tilesheet as a JSON atlas and (optionally)
slice it into individual PNGs. No scaling is ever applied.

Usage:
  python3 tools/slice_sheets.py SHEET.png --tile 16 [--spacing 1] [--margin 0] \
      [--atlas OUT.json] [--slice OUTDIR --prefix name_] [--skip-empty]

Atlas JSON format:
  {"image": "<sheet file name>", "tileW":16, "tileH":16, "spacing":1, "margin":0,
   "cols":N, "rows":M,
   "frames": {"<index>": {"x":..,"y":..,"w":16,"h":16, "col":c, "row":r, "empty":false}}}
Index = row*cols + col (0-based), same order as Kenney's "Tiles/tile_XXXX.png".
"""
import argparse, json, os
from PIL import Image

def describe(path, tw, th, spacing=0, margin=0):
    im = Image.open(path).convert("RGBA")
    cols = (im.width - 2 * margin + spacing) // (tw + spacing)
    rows = (im.height - 2 * margin + spacing) // (th + spacing)
    frames = {}
    for r in range(rows):
        for c in range(cols):
            x = margin + c * (tw + spacing); y = margin + r * (th + spacing)
            box = (x, y, x + tw, y + th)
            empty = im.crop(box).getbbox() is None
            frames[str(r * cols + c)] = {"x": x, "y": y, "w": tw, "h": th, "col": c, "row": r, "empty": empty}
    return im, {"image": os.path.basename(path), "tileW": tw, "tileH": th, "spacing": spacing,
                "margin": margin, "cols": cols, "rows": rows, "frames": frames}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet"); ap.add_argument("--tile", type=int, default=16)
    ap.add_argument("--tileh", type=int); ap.add_argument("--spacing", type=int, default=0)
    ap.add_argument("--margin", type=int, default=0); ap.add_argument("--atlas")
    ap.add_argument("--slice"); ap.add_argument("--prefix", default="tile_")
    ap.add_argument("--skip-empty", action="store_true")
    a = ap.parse_args()
    im, atlas = describe(a.sheet, a.tile, a.tileh or a.tile, a.spacing, a.margin)
    if a.atlas:
        with open(a.atlas, "w") as f: json.dump(atlas, f, indent=1)
    if a.slice:
        os.makedirs(a.slice, exist_ok=True)
        for k, fr in atlas["frames"].items():
            if a.skip_empty and fr["empty"]: continue
            im.crop((fr["x"], fr["y"], fr["x"] + fr["w"], fr["y"] + fr["h"])).save(
                os.path.join(a.slice, f"{a.prefix}{int(k):04d}.png"))
    print(f"{a.sheet}: {atlas['cols']}x{atlas['rows']} tiles, "
          f"{sum(1 for f in atlas['frames'].values() if not f['empty'])} non-empty")

if __name__ == "__main__":
    main()
