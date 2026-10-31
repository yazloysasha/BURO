# Пепося и Дудоня: Ночной аукцион

Офлайн-игра для iPhone (PWA): два кота — Пепося и Дудоня — держат ночную Лавку диковин, ходят в Забеги,
дерутся с клобстерами и открывают лаки-блоки.

> Статус: **подготовлены ассеты и ТЗ**, кода игры ещё нет. ТЗ — `SPEC.md`, задание кодеру — `CLAUDE_TASK.md`.

## Структура
```
assets/
  sprites/cats|enemies|animals|items|tiles|ui   спрайты + JSON-атласы (родные размеры)
  sfx/                                           звуки .m4a + .mp3
  items_index.json, animals_index.json, sfx_index.json
  ATLAS.md                                       раскладка кадров и атласов
tools/slice_sheets.py                            нарезка листов / генерация атласов
tools/prep/                                      скрипты сборки ассетов из сырых паков (сами паки не в репо)
SPEC.md  CLAUDE_TASK.md  CREDITS.md  LICENSES/
```

## Запуск (когда появится код)
```
python3 -m http.server 8080      # открыть http://localhost:8080
node --test                      # тесты
```
Деплой: GitHub Pages из корня ветки `main`. На iPhone: Safari → Поделиться → «На экран Домой».

## Лицензии
Все ассеты CC0, кроме иконок Kyrise (`assets/sprites/items/kyrise_*.png`) — CC BY 4.0, атрибуция обязательна.
Подробно — `CREDITS.md`, тексты — `LICENSES/`.

## Пересборка ассетов
Нужны сырые паки (ссылки в `CREDITS.md`), распакованные в одну папку `RAW`:
```
python3 tools/prep/build_cats.py    RAW assets
python3 tools/prep/build_sprites.py RAW assets
tools/prep/build_sfx.sh             RAW assets/sfx
python3 tools/slice_sheets.py assets/sprites/tiles/tiny_dungeon.png --tile 16 --atlas assets/sprites/tiles/tiny_dungeon.json
```
Имена папок внутри RAW — как в скриптах (`pet_cats_pack/`, `tiny-creatures/` и т.д.).
