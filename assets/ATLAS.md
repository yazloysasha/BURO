# ATLAS.md — раскладка спрайтов и звуков

Все PNG в **родном размере**, ничего не апскейлено. Масштабирование делаем только в рантайме,
целым множителем, с nearest-neighbor (`image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`).
В проекте три «родных» размера: **16×16** (основной), **32×32** (большие коты, еда), **34×34** (иконки 496-pack, у 149 из них нет прозрачных полей).
Иконки 8×8 (мелкие жуки) — тоже родные, рисовать на клетке 16 по центру.

## Коты — `sprites/cats/`
| Файл | Кадр | Что это |
|---|---|---|
| `peposya.png/.json` | 32×32 | **Пепося** — рыжий кот (LuizMelo Cat-1, сдвинут в более яркий оранжевый) |
| `dudonya.png/.json` | 32×32 | **Дудоня** — серая полосатая (LuizMelo Cat-6) + розовый бантик (дорисован скриптом покадрово) |
| `skins/skin_*.png/.json` | 32×32 | оригинальные 6 котов пака как скины: ginger, black, siamese, sphynx, white_fluffy, grey_tabby (siamese — без анимации itch) |
| `mini_peposya / mini_dudonya / mini_original` | 16×16 | маленькие коты (kotnaszynce) для карты/иконок; анимации `idle`(4) `walk_jump`(3) `death`(3) `attack`(6) |
| `meow_vfx.png/.json` | 16×16 ×3 | облачко «мяу» (LuizMelo) |

Большие коты смотрят **вправо**, ноги на нижней строке кадра (y=31), якорь — bottom-center.
Каждая анимация = одна **строка** листа; кадры идут слева направо от x=0. В JSON: `animations.<name> = {row, y, frames, fps, source}`.

Строки (у Пепоси и Дудони одинаковые):
| row | anim | кадров | fps |
|---|---|---|---|
| 0 | idle | 10 | 8 |
| 1 | walk | 8 | 10 |
| 2 | run | 8 | 12 |
| 3 | sit | 1 | — |
| 4 | sleep1 | 1 | — |
| 5 | sleep2 | 1 | — |
| 6 | lay (ложится) | 8 | 8 |
| 7 | meow | 4 | 8 |
| 8 | itch (чешется) | 2 | 6 |
| 9 | lick1 | 5 | 8 |
| 10 | lick2 | 5 | 8 |
| 11 | stretch | 13 | 10 |
| 12 | hurt (**сгенерировано**: красный тинт + белая вспышка кадра idle0) | 2 | 12 |

**Атаки в паке нет.** В JSON `aliases.attack = run, кадры 2–5` + рывок твином в коде. `taunt → meow`, `special → stretch`, `rest → sleep1`, `victory → lick1`.
У скинов строки идут в том же порядке, но если у кота нет анимации (Cat-3 без `itch`), строка пропущена — всегда читайте `row` из JSON.

## Враги — `sprites/enemies/enemies.png` + `enemies.json`
Клетка 16×16, один враг = одна строка, `frames` = 1 или 2 (двухкадровые: муравьи OGA и жуки madameberry).
`enemies.<id> = {row, y, frames, name_ru, source, note}`. 24 врага:
klobster, klobster_king (мини-босс, корона дорисована), klobster_toxic, klobster_glitch, beetle, ant_giant, ant_red, ant_grey,
wasp, fly, spider, scorpion, worm, moth, firefly, gnat, dragonfly, bee_small, beetle_small, rat, bat, ghost, slime, mimic.
Мелкие жуки (moth…beetle_small) нарисованы 8×8 и вставлены в клетку 16×16 (снизу, по центру) — без увеличения.
Богомола нет ни в одном паке.

## Животные — `sprites/animals/*.png` + `assets/animals_index.json`
95 отдельных PNG: `{id, file, w, h, source, name_guess, note}`. `name_guess: true` = название дано на глаз.
`hamster` = перекраска коричневой крысы Tiny Dungeon #123; `dog` = перекраска лисы Tiny Creatures #170 (настоящих хомяка и собаки в паках нет).

## Предметы — `sprites/items/*.png` + `assets/items_index.json`
825 отдельных иконок. Префиксы: `rpg496_` (34×34), `kyrise_` (16×16, **CC BY 4.0**), `food_` (32×32), `td_` (16×16).
`items_index.json`: `[{file, source, w, h, category_guess}]`. `category_guess` — эвристика по имени файла, не истина.

## Тайлы — `sprites/tiles/*.png` + `*.json`
Атласы сгенерированы `tools/slice_sheets.py` (формат описан в его docstring; индекс = row*cols+col, как у Kenney `tile_XXXX`).
| файл | тайл | spacing | сетка |
|---|---|---|---|
| tiny_dungeon | 16 | 0 | 12×11 |
| tiny_town | 16 | 0 | 12×11 |
| tiny_creatures | 16 | 0 | 10×18 (индекс = номер файла `tile_000N` − 1) |
| roguelike_indoor | 16 | 1 | 27×18 |
| onebit_colored | 16 | 0 | 49×22 |

## UI — `sprites/ui/`
`ui_sheet.png/.json` (Kenney Pixel UI, 16px, spacing 2, 30×33), `nine_slice/{colored,outline,ancient}/*.png` + `list/space/space_inlay.png`
(48×48; рамку 16px я предполагаю — проверьте глазами; для CSS `border-image` или 9-slice на canvas), `skills/*.png` — 154 иконки навыков 34×34 (496-pack, префикс S_), `meow_vfx.png`.

## Звуки — `assets/sfx/*.m4a` + `*.mp3`, индекс `assets/sfx_index.json`
52 эффекта, AAC 96k (.m4a, основной для iOS) и MP3 96k (запасной). `{m4a, mp3, duration_s, source, note}`.
Подобраны **по названиям файлов, не прослушаны**. Заменители: `meow_sub*` (мяуканья нет), `wash_sub` (звука воды нет).
