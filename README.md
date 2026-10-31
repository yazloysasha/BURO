# Пепося и Дудоня: Ночной аукцион

Офлайн-игра для iPhone (PWA): два кота — Пепося и Дудоня — держат ночную Лавку диковин, ходят в Забеги,
дерутся с клобстерами, открывают лаки-блоки и собирают альбом наклеек.

ТЗ — `SPEC.md`, краткое задание — `CLAUDE_TASK.md`, авторы ассетов — `CREDITS.md`.

## Запуск локально
```
python3 -m http.server 8080      # открыть http://localhost:8080
node --test                      # тесты (Node ≥ 18, без зависимостей)
```
Никакой сборки не нужно: ванильный JS (ES-модули), всё работает «как есть» со статического хостинга.

## Деплой на GitHub Pages
1. Settings → Pages → Source: **Deploy from a branch**, ветка `main`, папка `/ (root)`.
2. Все пути относительные (`./`), поэтому игра работает и в подпапке `https://<user>.github.io/<repo>/`.
   Файл `.nojekyll` уже лежит в корне.
3. На iPhone: открыть адрес в Safari → «Поделиться» → «На экран Домой». После первого запуска игра работает
   в авиарежиме (все ассеты в кеше service worker).

### После изменения файлов
Service worker кеширует всё по списку `precache-manifest.js`. После любой правки ассетов/кода/данных:
```
node tools/gen_precache.mjs      # пересобрать список и поднять версию кеша buro-v<N>
node --test                      # тест упадёт, если список устарел
```
Игроку при следующем запуске покажется «Готово обновление Лавки!» с кнопкой «Обновить».

## Структура
```
index.html, manifest.webmanifest, sw.js, precache-manifest.js, .nojekyll
css/style.css                 стили (9-slice рамки, pixelated)
fonts/Tiny5-Regular.ttf       пиксельный шрифт с кириллицей (OFL)
icons/icon-{180,192,512}.png  иконки приложения (собраны из спрайтов котов)
js/core/    rng, save (миграции), storage (localStorage + IndexedDB), audio, sprite, loop, i18n, assets, dom
js/game/    map, combat, run, loot, blocks, daily, collection, rooms, combos, progress, meta, names, namegen
js/ui/      экраны (screens/*), бой, карта, лаки-блоки, частицы, сцена Лавки
data/       весь контент: items, animals, enemies, rooms, events, combos, album, talents, upgrades, tiers,
            skins, rarities, modifiers, statuses, balance, strings.ru (все строки UI), gen/* (генераторы)
assets/     спрайты и звуки (родные размеры), индексы
tools/      gen_precache.mjs, gen_icons.mjs, build_content.mjs (items/animals/album из индексов), png.mjs
tests/      node:test — RNG, сейв и миграции, карта (1000 сидов), бой, лут/pity/daily, комнаты, комбо, мета,
            валидация всех data/*.json и ссылок на файлы, precache, PWA, размер репо
```

## Контент
- 517 предметов (редкости обычный → слоп), 89 зверей, 23 вида врагов + мини-босс «Королевский клобстер» (2 фазы)
- 10 типов комнат: бой, гнездо, находка (лаки-блоки), аномалия 3×3/4×4, полка, мойка, лежанка, событие (33), ларёк, босс
- 43 комбо + журнал, 24 страницы альбома, 3 ветки талантов, 5 тиров Лавки, 5 улучшений, 10 скинов
- Модификаторы Грязный / Блестящий / Глючный / Проклятый / Золотой / Радужный рисуются в рантайме
- Pity виден игроку (эпик ≤ 10 блоков, легендарка ≤ 40), ежедневный подарок без таймеров, мягкая серия

## Сейвы
Сохранение после **каждого** действия (localStorage синхронно + зеркало в IndexedDB + резервная копия).
Состояние RNG — часть сейва, поэтому перезапуск не даёт «перероллить». Экспорт/импорт — в Настройках
(JSON-строка). Версии сейва мигрируют автоматически (`js/core/save.js`, тесты в `tests/save.test.mjs`).

## Перегенерация контента и ассетов
```
node tools/build_content.mjs     # data/items.json, data/animals.json, data/album.json
node tools/gen_icons.mjs         # icons/*.png
```
Сырые паки для пересборки спрайтов (ссылки в `CREDITS.md`) распаковать в папку `RAW`:
```
python3 tools/prep/build_cats.py    RAW assets
python3 tools/prep/build_sprites.py RAW assets
tools/prep/build_sfx.sh             RAW assets/sfx
```

## Лицензии
Все ассеты CC0, кроме иконок Kyrise (`assets/sprites/items/kyrise_*.png`) — CC BY 4.0, атрибуция показана
на экране «Авторы». Шрифт Tiny5 — SIL OFL 1.1. Подробно — `CREDITS.md`, тексты — `LICENSES/`.
