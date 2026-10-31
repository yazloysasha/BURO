#!/usr/bin/env python3
"""Builds enemies / animals / items / tiles / ui from the raw packs (see CREDITS.md).
Run: python3 build_sprites.py <raw_extracted_dir> <BURO/assets>
Never upscales. Recolors are hue/ramp remaps of the original pixels.
"""
import sys, os, json, glob, shutil, colorsys, re
from PIL import Image
RAW, OUT = sys.argv[1], sys.argv[2]
S = os.path.join(OUT, "sprites")
TC = Image.open(f"{RAW}/tiny-creatures/tiny-creatures/Tilemap/tilemap_packed.png").convert("RGBA")   # 10 cols
TD = Image.open(f"{RAW}/tiny-dungeon/Tilemap/tilemap_packed.png").convert("RGBA")                    # 12 cols
def tc(n):  # n = 1-based number of Tiles/tile_000N.png in Tiny Creatures
    r, c = divmod(n - 1, 10); return TC.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
def td(n):  # n = 0-based number of Tiles/tile_00NN.png in Tiny Dungeon
    r, c = divmod(n, 12); return TD.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16))
def mk(d): os.makedirs(d, exist_ok=True); return d

def hue_map(im, fn):
    out = im.copy(); px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h, s, v = fn(h, s, v)
            px[x, y] = tuple(int(max(0, min(1, c)) * 255) for c in colorsys.hsv_to_rgb(h % 1, s, v)) + (a,)
    return out
def pad16(im):
    o = Image.new("RGBA", (16, 16)); o.alpha_composite(im, ((16 - im.width) // 2, 16 - im.height - 3)); return o

# ------------------------------------------------------------------ ENEMIES
klob = tc(144)
def crown(im):
    o = im.copy(); bb = o.getbbox(); top = bb[1]; cx = (bb[0] + bb[2]) // 2
    G, Y, R = (120, 80, 0, 255), (255, 210, 40, 255), (230, 40, 60, 255)
    pat = ["Y.Y.Y", "YYRYY", "GGGGG"]
    oy = max(0, top - 3)
    for j, row in enumerate(pat):
        for i, ch in enumerate(row):
            if ch != ".": o.putpixel((cx - 2 + i, oy + j), {"Y": Y, "G": G, "R": R}[ch])
    return o
def mb(name, idx=None): # madameberry 16x8 = two 8x8 frames
    im = Image.open(f"{RAW}/cutebugs_by_madameberry/{name}.png").convert("RGBA")
    return [pad16(im.crop((0, 0, 8, 8))), pad16(im.crop((8, 0, 16, 8)))]
ant = lambda f: Image.open(f).convert("RGBA")
ENEMIES = [  # id, name_ru, frames, source, note
 ("klobster", "Клобстер", [hue_map(klob, lambda h, s, v: (0.02, min(1, s * 1.3 + .1), v))], "Tiny Creatures #144 (recolor)", "cockroach-like beetle recolored reddish-brown; signature enemy"),
 ("klobster_king", "Королевский клобстер", [crown(hue_map(klob, lambda h, s, v: (0.78, min(1, s * 1.2 + .15), min(1, v * 1.1))))], "Tiny Creatures #144 (recolor + drawn crown)", "mini-boss"),
 ("klobster_toxic", "Токсичный клобстер", [hue_map(klob, lambda h, s, v: (0.28, min(1, s + .2), min(1, v * 1.1)))], "Tiny Creatures #144 (recolor)", "variant"),
 ("klobster_glitch", "Глючный клобстер", [hue_map(klob, lambda h, s, v: (0.5, min(1, s + .25), min(1, v * 1.2)))], "Tiny Creatures #144 (recolor)", "variant"),
 ("beetle", "Жук", [tc(144)], "Tiny Creatures #144", ""),
 ("ant_giant", "Гигантский муравей", [tc(143)], "Tiny Creatures #143", ""),
 ("ant_red", "Рыжий муравей", [ant(f"{RAW}/red_ant_frames/red_ant_frames/antEnemyRed-{i}.png") for i in (1, 2)], "OGA 16x16 Ant Enemies", "2-frame walk"),
 ("ant_grey", "Серый муравей", [ant(f"{RAW}/grey_ant_frames/grey_ant_frames/antEnemy-{i}.png") for i in (1, 2)], "OGA 16x16 Ant Enemies", "2-frame walk"),
 ("wasp", "Оса", [tc(141)], "Tiny Creatures #141", "bee/wasp"),
 ("fly", "Муха", [tc(142)], "Tiny Creatures #142", "fly/mosquito (name_guess)"),
 ("spider", "Паук", [td(122)], "Tiny Dungeon #122", ""),
 ("scorpion", "Скорпион", [tc(146)], "Tiny Creatures #146", ""),
 ("worm", "Червь", [tc(145)], "Tiny Creatures #145", "coiled segmented worm (name_guess)"),
 ("moth", "Моль", mb("moth"), "Madameberry cute bugs", "8x8 art padded into 16x16, 2 frames"),
 ("firefly", "Светлячок", mb("firefly"), "Madameberry cute bugs", "8x8 padded, 2 frames"),
 ("gnat", "Мошка", mb("gnat"), "Madameberry cute bugs", "8x8 padded, 2 frames"),
 ("dragonfly", "Стрекоза", mb("dragonfly"), "Madameberry cute bugs", "8x8 padded, 2 frames"),
 ("bee_small", "Пчёлка", mb("bee"), "Madameberry cute bugs", "8x8 padded, 2 frames"),
 ("beetle_small", "Жучок", mb("beetle"), "Madameberry cute bugs", "8x8 padded, 2 frames"),
 ("rat", "Крыса", [td(123)], "Tiny Dungeon #123", "non-insect extra"),
 ("bat", "Летучая мышь", [td(120)], "Tiny Dungeon #120", "non-insect extra"),
 ("ghost", "Призрак", [td(121)], "Tiny Dungeon #121", "non-insect extra"),
 ("slime", "Слизень", [td(108)], "Tiny Dungeon #108", "green slime/ghost (name_guess)"),
 ("mimic", "Мимик", [td(92)], "Tiny Dungeon #92", "chest mimic"),
]
d = mk(f"{S}/enemies"); cols = max(len(e[2]) for e in ENEMIES)
sheet = Image.new("RGBA", (cols * 16, len(ENEMIES) * 16)); meta = {"image": "enemies.png", "frameW": 16, "frameH": 16, "enemies": {}}
for i, (eid, ru, frs, src, note) in enumerate(ENEMIES):
    for j, f in enumerate(frs): sheet.alpha_composite(f, (j * 16, i * 16))
    meta["enemies"][eid] = {"row": i, "y": i * 16, "frames": len(frs), "name_ru": ru, "source": src, "note": note}
sheet.save(f"{d}/enemies.png"); json.dump(meta, open(f"{d}/enemies.json", "w"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ ANIMALS (individual PNGs + index)
TCA = {130: "camel", 131: "owl_white", 132: "owlet", 133: "owl_brown", 134: "hedgehog", 135: "eagle", 136: "eagle_bald",
       137: "crow", 138: "mole", 139: "bat_brown", 140: "flying_beast", 147: "lizard", 148: "frog", 149: "crocodile",
       150: "turtle", 151: "chicken", 152: "cow", 153: "goat", 154: "sheep", 155: "emu", 156: "zebra", 157: "lion",
       158: "tiger", 159: "elephant", 160: "giraffe", 161: "boar", 162: "deer", 163: "elk", 164: "bear_brown",
       165: "bear_polar", 166: "gorilla_dark", 167: "gorilla", 168: "chimp", 169: "monkey", 170: "fox", 171: "rhino",
       172: "hippo", 173: "shark", 174: "orca", 175: "dolphin", 176: "squirrel", 177: "otter", 178: "rabbit",
       179: "raccoon", 180: "badger", 61: "fish_big_green", 62: "fish_big_pink", 63: "fish_big_grey", 64: "fish_big_gold",
       65: "fish_big_orange", 71: "fish_green", 72: "fish_pink", 73: "fish_grey", 74: "fish_gold", 75: "fish_orange",
       41: "snake_green", 42: "snake_sand", 51: "horse", 52: "unicorn", 53: "pegasus", 55: "unicorn_dark",
       94: "cat_beast_dark", 95: "cat_grey", 104: "parrot", 105: "griffin", 106: "griffin_brown", 118: "owl_grey",
       31: "dragon_white", 32: "dragon_blue", 33: "dragon_grey", 34: "dragon_red", 35: "dragon_green", 24: "wolf_grey",
       91: "bear_owl", 102: "bear_standing", 108: "lion_cub"}
SURE = {"camel","owl_white","eagle","crow","lizard","frog","turtle","chicken","cow","goat","sheep","zebra","lion","tiger",
        "elephant","giraffe","boar","deer","bear_brown","bear_polar","gorilla","monkey","rhino","hippo","shark","orca",
        "dolphin","squirrel","rabbit","raccoon","horse","unicorn","pegasus","snake_green","dragon_red","dragon_green",
        "dragon_blue","dragon_white","dragon_grey"}
d = mk(f"{S}/animals"); idx = []
def add_animal(aid, im, src, sure, note=""):
    fn = f"{aid}.png"; im.save(f"{d}/{fn}")
    idx.append({"id": aid, "file": f"sprites/animals/{fn}", "w": im.width, "h": im.height, "source": src,
                "name_guess": not sure, "note": note})
for n, a in TCA.items(): add_animal(a, tc(n), f"Tiny Creatures #{n}", a in SURE)
add_animal("bat", td(120), "Tiny Dungeon #120", True)
add_animal("rat_brown", td(123), "Tiny Dungeon #123", True)
add_animal("rat_grey", td(124), "Tiny Dungeon #124", True)
add_animal("crab", td(110), "Tiny Dungeon #110", False, "red crab-like creature")
add_animal("hamster", hue_map(td(123), lambda h, s, v: (0.09, min(1, s * 0.9 + .15), min(1, v * 1.35 + .05))),
           "Tiny Dungeon #123 RECOLOR", False, "hamster = golden recolor of the brown rat sprite (no real hamster sprite in any pack)")
add_animal("dog", hue_map(tc(170), lambda h, s, v: (0.07, s * 0.6, v * 0.85)), "Tiny Creatures #170 RECOLOR", False,
           "dog = desaturated brown recolor of fox sprite #170 (no dog sprite in packs)")
for bug in ["bee", "beetle", "dragonfly", "firefly", "gnat", "moth"]:
    im = Image.open(f"{RAW}/cutebugs_by_madameberry/{bug}.png").convert("RGBA").crop((0, 0, 8, 8))
    add_animal(f"bug_{bug}", im, "Madameberry cute bugs (frame 1)", True, "8x8 native")
P = f"{RAW}/pet_cats_pack/Pet Cats Pack"
for n, s in {1: "ginger", 2: "black", 3: "siamese", 4: "sphynx", 5: "white_fluffy", 6: "grey_tabby"}.items():
    add_animal(f"cat_{s}", Image.open(f"{P}/Cat-{n}/Cat-{n}-Sitting.png").convert("RGBA").crop((9, 0, 41, 32)),
               f"LuizMelo Pet Cats Pack Cat-{n} Sitting", True, "32x32")
add_animal("cat_kitkus", Image.open(f"{RAW}/1_5/kitkus 16x16 1.png").convert("RGBA"), "kotnaszynce cute kitty", True)
json.dump(idx, open(f"{OUT}/animals_index.json", "w"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ ITEMS (individual PNGs + index)
d = mk(f"{S}/items"); items = []
def cat496(stem):
    for p, c in [("I_C_", "food"), ("W_", "weapon_tool"), ("P_", "potion"), ("E_", "material"), ("Ac_", "jewelry"),
                 ("A_", "clothes"), ("C_", "clothes"), ("I_Key", "key"), ("I_Chest", "container"), ("I_", "misc")]:
        if stem.startswith(p): return c
    return "misc"
KYC = {"book": "book", "spellbook": "book", "scroll": "book", "coin": "currency", "potion": "potion", "necklace": "jewelry",
       "ring": "jewelry", "pearl": "jewelry", "gem": "gem", "crystal": "gem", "shard": "gem", "arrow": "weapon_tool",
       "shield": "weapon_tool", "staff": "weapon_tool", "sword": "weapon_tool", "bow": "weapon_tool", "candy": "food",
       "fruit": "food", "fish": "food", "cookie": "food", "key": "key", "gift": "lootbox", "giftopen": "lootbox",
       "hat": "clothes", "boots": "clothes", "armor": "clothes", "gloves": "clothes", "ingot": "material",
       "plank": "material", "wood": "material", "stoneblock": "material", "cotton": "material", "bone": "junk",
       "skull": "junk", "leaf": "nature", "flower": "nature", "cup": "household", "candle": "household"}
def snake(s): return re.sub(r"[^a-z0-9]+", "_", re.sub(r"(?<=[a-z0-9])([A-Z])", r"_\1", s).lower()).strip("_")
def add_item(fn, im, src, cat):
    if fn in {i["file"].split("/")[-1] for i in items}: raise SystemExit("dup " + fn)
    im.save(f"{d}/{fn}"); items.append({"file": f"sprites/items/{fn}", "source": src, "w": im.width, "h": im.height, "category_guess": cat})
for f in sorted(glob.glob(f"{RAW}/496_RPG_icons/*.png")):
    stem = os.path.basename(f)[:-4]
    if stem.startswith("S_"): continue
    add_item(f"rpg496_{snake(stem)}.png", Image.open(f).convert("RGBA"), "496 pixel art icons (gnola14, CC0)", cat496(stem))
for f in sorted(glob.glob(f"{RAW}/kyrise_16x16_rpg_icons/*/icons/16x16/*.png")):
    stem = os.path.basename(f)[:-4]
    add_item(f"kyrise_{stem}.png", Image.open(f).convert("RGBA"), "Kyrise's 16x16 RPG Icon Pack (CC BY 4.0)", KYC.get(stem.split("_")[0], "misc"))
for f in sorted(glob.glob(f"{RAW}/ghostpixxells_pixelfood/*.png")):
    stem = os.path.basename(f)[:-4]
    add_item(f"food_{snake(stem)}.png", Image.open(f).convert("RGBA"), "Ghostpixxells Free Pixel Food (CC0)", "food")
TDI = {89: "chest_wood", 90: "chest_wood_b", 91: "chest_gold", 92: "chest_mimic", 101: "coin_bronze", 102: "coin_silver",
       103: "dagger", 104: "sword_short", 105: "sword_broad", 106: "sword_long", 107: "sword_bronze", 113: "potion_empty",
       114: "potion_green", 115: "potion_red", 116: "potion_blue", 117: "hammer", 118: "axe_double", 119: "axe",
       125: "vial_empty", 126: "vial_green", 127: "vial_red", 128: "vial_blue", 129: "wand_purple", 130: "staff_wood",
       131: "spear", 64: "anvil_small", 65: "tombstone", 66: "sign_wood", 73: "stool", 74: "anvil", 82: "barrel"}
for n, nm in TDI.items():
    add_item(f"td_{nm}.png", td(n), f"Kenney Tiny Dungeon #{n} (CC0)",
             "container" if "chest" in nm or nm == "barrel" else "potion" if "potion" in nm or "vial" in nm else
             "currency" if "coin" in nm else "household" if nm in ("stool", "sign_wood", "tombstone", "anvil", "anvil_small") else "weapon_tool")
json.dump(items, open(f"{OUT}/items_index.json", "w"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ UI
u = mk(f"{S}/ui/skills")
for f in sorted(glob.glob(f"{RAW}/496_RPG_icons/S_*.png")):
    Image.open(f).convert("RGBA").save(f"{u}/{snake(os.path.basename(f)[:-4])}.png")
for sub in ["Colored", "Outline", "Ancient"]:
    for f in glob.glob(f"{RAW}/pixel-ui-pack/9-Slice/{sub}/*.png"):
        shutil.copy(f, mk(f"{S}/ui/nine_slice/{sub.lower()}") + "/" + os.path.basename(f))
for f in glob.glob(f"{RAW}/pixel-ui-pack/9-Slice/*.png"):
    shutil.copy(f, mk(f"{S}/ui/nine_slice") + "/" + os.path.basename(f))
shutil.copy(glob.glob(f"{RAW}/pixel-ui-pack/**/UIpackSheet_transparent.png", recursive=True)[0], f"{S}/ui/ui_sheet.png")
shutil.copy(f"{RAW}/pet_cats_pack/Pet Cats Pack/Meow-VFX/Meow-VFX.png", f"{S}/ui/meow_vfx.png")

# ------------------------------------------------------------------ TILES (sheets only; atlas JSON made by slice_sheets.py)
t = mk(f"{S}/tiles")
shutil.copy(f"{RAW}/tiny-dungeon/Tilemap/tilemap_packed.png", f"{t}/tiny_dungeon.png")
shutil.copy(f"{RAW}/tiny-town/Tilemap/tilemap_packed.png", f"{t}/tiny_town.png")
shutil.copy(f"{RAW}/tiny-creatures/tiny-creatures/Tilemap/tilemap_packed.png", f"{t}/tiny_creatures.png")
shutil.copy(f"{RAW}/roguelike-indoors/Tilesheets/roguelikeIndoor_transparent.png", f"{t}/roguelike_indoor.png")
shutil.copy(f"{RAW}/1-bit-pack/Tilesheet/colored-transparent_packed.png", f"{t}/onebit_colored.png")
print("enemies", len(ENEMIES), "animals", len(idx), "items", len(items))
