# Playtest report: «Пепося и Дудоня: Ночной аукцион» (M6)

All numbers come from scripts in `playtest/`, and the raw data is in `playtest/results/`. There are two sources:

- **UI bot** (`playtest/bot.mjs`): real Chromium. It plays only through taps on iPhone 414×896 DPR 2 with touch, and through clicks on Windows 1366×768 DPR 1. It reads the save from localStorage to decide what to do and never calls game functions.
- **Simulator** (`playtest/sim.mjs`): the same four player models, but calling the game functions directly. It runs 200 careers × 30 runs per model in about a minute. The simulator tunes the numbers and the UI bot confirms them. Before tuning they agreed: the sim gave 95–100% wins and the UI bot gave 34 of 36.

The player models are in `playtest/lib/strategy.mjs`:

| Model | What it does | Stands for |
|---|---|---|
| random | presses anything, random route | lower bound, crash finder |
| greedy | bites everything, chases loot and elites, defends rarely, Дудоня leads | a newcomer in a hurry |
| cautious | heals early, avoids elites, hoards | a careful newcomer |
| smart | reads intents, focuses targets, plays combos, saves items for the king | a good player |

Bots don't learn and real players do, so the newcomer numbers below are a pessimistic bound.

## 1. UI runs (60 runs, after tuning)

| Профиль | Стратегия | Сид | Забег | Тир | Взнос | Дошёл до босса | Итог | Монет домой | из них продажа | Комнат | Тапов | Секунд бота |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| iPhone | greedy | 1 | 1 | 1 | 0 | да | король, этаж 10/10 | 37 | 0 | 10 | 147 | 40 |
| iPhone | greedy | 1 | 2 | 1 | 10 | да | победа | 137 | 0 | 10 | 113 | 29 |
| iPhone | greedy | 1 | 3 | 1 | 10 | да | король, этаж 10/10 | 38 | 0 | 10 | 106 | 31 |
| iPhone | greedy | 1 | 4 | 1 | 10 | да | победа | 138 | 0 | 10 | 112 | 29 |
| iPhone | greedy | 2 | 1 | 1 | 0 | да | король, этаж 11/11 | 7 | 0 | 11 | 114 | 36 |
| iPhone | greedy | 2 | 2 | 1 | 10 | да | король, этаж 10/10 | 34 | 0 | 10 | 146 | 45 |
| iPhone | greedy | 2 | 3 | 1 | 10 | да | король, этаж 11/11 | 28 | 0 | 11 | 128 | 38 |
| iPhone | greedy | 2 | 4 | 1 | 10 | да | победа | 163 | 0 | 11 | 136 | 44 |
| iPhone | greedy | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 41 | 0 | 10 | 114 | 36 |
| iPhone | greedy | 0 | 2 | 1 | 10 | да | победа | 125 | 0 | 10 | 114 | 37 |
| iPhone | greedy | 0 | 3 | 1 | 10 | да | король, этаж 10/10 | 58 | 0 | 10 | 144 | 47 |
| iPhone | greedy | 0 | 4 | 1 | 10 | да | король, этаж 10/10 | 44 | 0 | 10 | 159 | 43 |
| iPhone | random | 2 | 1 | 1 | 0 | нет | бой, этаж 9/11 | 32 | 0 | 9 | 116 | 37 |
| iPhone | random | 2 | 2 | 1 | 10 | да | король, этаж 11/11 | 43 | 0 | 11 | 186 | 58 |
| iPhone | random | 2 | 3 | 1 | 10 | да | король, этаж 11/11 | 26 | 0 | 11 | 186 | 61 |
| iPhone | random | 2 | 4 | 1 | 10 | да | король, этаж 11/11 | 33 | 0 | 11 | 168 | 57 |
| iPhone | random | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 15 | 0 | 10 | 90 | 28 |
| iPhone | random | 0 | 2 | 1 | 10 | да | король, этаж 10/10 | 42 | 0 | 10 | 222 | 60 |
| iPhone | random | 0 | 3 | 1 | 10 | да | победа | 197 | 36 | 11 | 168 | 51 |
| iPhone | random | 0 | 4 | 1 | 10 | да | король, этаж 10/10 | 26 | 0 | 10 | 190 | 63 |
| iPhone | random | 1 | 1 | 1 | 0 | да | король, этаж 11/11 | 34 | 0 | 11 | 213 | 64 |
| iPhone | random | 1 | 2 | 1 | 10 | да | король, этаж 10/10 | 20 | 0 | 10 | 170 | 46 |
| iPhone | random | 1 | 3 | 1 | 10 | да | король, этаж 11/11 | 35 | 0 | 11 | 222 | 82 |
| iPhone | random | 1 | 4 | 1 | 10 | да | победа | 125 | 12 | 10 | 157 | 45 |
| iPhone | cautious | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 46 | 0 | 10 | 198 | 59 |
| iPhone | cautious | 0 | 2 | 1 | 10 | да | король, этаж 10/10 | 45 | 0 | 10 | 139 | 49 |
| iPhone | cautious | 0 | 3 | 1 | 10 | да | король, этаж 11/11 | 42 | 0 | 11 | 169 | 52 |
| iPhone | cautious | 0 | 4 | 1 | 10 | да | победа | 166 | 0 | 11 | 108 | 32 |
| iPhone | cautious | 1 | 1 | 1 | 0 | да | король, этаж 10/10 | 33 | 0 | 10 | 180 | 60 |
| iPhone | cautious | 1 | 2 | 1 | 10 | да | король, этаж 11/11 | 28 | 0 | 11 | 160 | 55 |
| iPhone | cautious | 1 | 3 | 1 | 10 | да | король, этаж 10/10 | 34 | 0 | 10 | 141 | 50 |
| iPhone | cautious | 1 | 4 | 1 | 10 | да | король, этаж 11/11 | 14 | 0 | 11 | 130 | 46 |
| iPhone | smart | 1 | 1 | 1 | 0 | да | победа | 116 | 0 | 10 | 127 | 42 |
| iPhone | smart | 1 | 2 | 1 | 10 | да | победа | 139 | 0 | 10 | 126 | 38 |
| iPhone | smart | 1 | 3 | 2 | 25 | да | король, этаж 10/10 | 38 | 0 | 10 | 134 | 35 |
| iPhone | smart | 1 | 4 | 2 | 25 | да | король, этаж 11/11 | 31 | 0 | 11 | 176 | 56 |
| iPhone | cautious | 2 | 1 | 1 | 0 | да | король, этаж 11/11 | 16 | 0 | 11 | 201 | 57 |
| iPhone | cautious | 2 | 2 | 1 | 10 | да | король, этаж 11/11 | 18 | 0 | 11 | 139 | 49 |
| iPhone | cautious | 2 | 3 | 1 | 10 | да | король, этаж 10/10 | 34 | 0 | 10 | 146 | 49 |
| iPhone | cautious | 2 | 4 | 1 | 10 | да | король, этаж 11/11 | 30 | 0 | 11 | 207 | 62 |
| iPhone | smart | 2 | 1 | 1 | 0 | да | король, этаж 11/11 | 19 | 0 | 11 | 176 | 56 |
| iPhone | smart | 2 | 2 | 1 | 10 | да | победа | 126 | 0 | 10 | 114 | 27 |
| iPhone | smart | 2 | 3 | 1 | 10 | да | победа | 100 | 0 | 10 | 118 | 37 |
| iPhone | smart | 2 | 4 | 1 | 10 | да | победа | 137 | 0 | 10 | 149 | 50 |
| iPhone | smart | 0 | 1 | 1 | 0 | да | победа | 131 | 0 | 11 | 147 | 47 |
| iPhone | smart | 0 | 2 | 2 | 25 | да | король, этаж 11/11 | 3 | 0 | 11 | 224 | 70 |
| iPhone | smart | 0 | 3 | 2 | 0 | да | король, этаж 11/11 | 52 | 0 | 11 | 143 | 43 |
| iPhone | smart | 0 | 4 | 2 | 25 | да | король, этаж 11/11 | 45 | 0 | 11 | 179 | 65 |
| Windows | greedy | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 41 | 0 | 10 | 114 | 34 |
| Windows | greedy | 0 | 2 | 1 | 10 | да | победа | 125 | 0 | 10 | 114 | 36 |
| Windows | greedy | 0 | 3 | 1 | 10 | да | король, этаж 10/10 | 58 | 0 | 10 | 144 | 45 |
| Windows | random | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 15 | 0 | 10 | 90 | 27 |
| Windows | random | 0 | 2 | 1 | 10 | да | король, этаж 10/10 | 42 | 0 | 10 | 222 | 56 |
| Windows | random | 0 | 3 | 1 | 10 | да | победа | 197 | 36 | 11 | 168 | 49 |
| Windows | smart | 0 | 1 | 1 | 0 | да | победа | 131 | 0 | 11 | 147 | 47 |
| Windows | smart | 0 | 2 | 2 | 25 | да | король, этаж 11/11 | 3 | 0 | 11 | 224 | 67 |
| Windows | smart | 0 | 3 | 2 | 0 | да | король, этаж 11/11 | 52 | 0 | 11 | 143 | 41 |
| Windows | cautious | 0 | 1 | 1 | 0 | да | король, этаж 10/10 | 46 | 0 | 10 | 198 | 57 |
| Windows | cautious | 0 | 2 | 1 | 10 | да | король, этаж 10/10 | 45 | 0 | 10 | 139 | 46 |
| Windows | cautious | 0 | 3 | 1 | 10 | да | король, этаж 11/11 | 42 | 0 | 11 | 169 | 50 |

### Summary

| Набор | Забегов | Побед | До босса | Монет домой | Тапов | Комнат | Секунд бота | Ошибок | Внешних запросов |
|---|---|---|---|---|---|---|---|---|---|
| до баланса, iPhone | 36 | 94% | 100% | 135 | 107 | 8.8 | 37 | 0 | 0 |
| после, iPhone | 48 | 27% | 98% | 61 | 153 | 10.4 | 48 | 0 | 0 |
| после, Windows | 12 | 25% | 100% | 66 | 156 | 10.4 | 46 | 0 | 0 |
| после, random | 15 | 20% | 93% | 59 | 171 | 10.4 | 52 | 0 | 0 |
| после, greedy | 15 | 33% | 100% | 72 | 127 | 10.2 | 38 | 0 | 0 |
| после, cautious | 15 | 7% | 100% | 43 | 162 | 10.5 | 52 | 0 | 0 |
| после, smart | 15 | 47% | 100% | 75 | 155 | 10.6 | 48 | 0 | 0 |

- 0 page errors, 0 console errors, 0 bot crashes, 0 requests outside the local server, across all 96 UI runs (36 before tuning, 60 after). These 60 are the final ones, played after the backroom redesign below; every one of them also includes a night shift through the UI when the daily reward was still open (26 shifts).
- Plus 2 runs in **WebKit** (iPhone profile, the closest to Safari that runs here): one win, one loss at the king, 0 errors.
- "Seconds" is the bot's wall clock with real animations and no skipping. It is not human time; see §2.

### Where runs ended (UI, after)
44 of 60 runs were lost: 43 at the king and 1 in an ordinary fight on floor 9 (random). Wins and losses by model are in the table above.

## 2. Balance and economy: before / after (simulator, 200 careers × 30 runs per model)

| Metric | Target | random before → after | greedy | cautious | smart |
|---|---|---|---|---|---|
| Win rate, all 30 runs | good player 40–60% | 99% → 63%¹ | 95% → **24%** | 100% → **28%** | 100% → **61%** |
| Win rate, run 1 | low | 92%² → 4% | — → 5% | — → 3% | — → 38% |
| Win rate, runs 2–5 / 6–10 | | — → 20% / 35% | — → 30% / 16% | — → 26% / 37% | — → **52% / 49%** |
| Win rate, runs 11–20 / 21–30 | | — → 67% / 94% | — → 22% / 28% | — → 25% / 31% | — → 62% / 72% |
| First win (median run #) | newcomer at 3–5 | 1 → 5 | 1 → **3** | 1 → **4** | 1 → 2 |
| First run, minutes (estimate³) | 5–8 | 4.9 → 6.4 | 3.4 → 4.8 | 3.6 → 6.2 | 3.2 → 5.4 |
| Coins home per run | | 227 → 164 | 280 → 92 | 218 → 76 | 242 → 155 |
| Runs played for free (no coins for the fee) | never a dead end | 0% → 0% | 1% → 1% | 0% → 0% | 0% → 1% |
| Fee pays off (net positive) from run # | | 2 → 2 | 2 → 2 | 2 → 2 | 2 → 2 |
| First upgrade bought (median run #) | | 1 → 2 | 1 → 2 | 1 → 2 | 1 → 2 |
| First album page (median run #) | | 28 → 10 | 23 → 9 | 22 → 8 | 23 → 7 |
| Share of careers finishing a page in 30 runs | | 6% → 98% | 71% → 100% | 61% → 100% | 60% → 100% |
| Album pages after 30 runs | | 0.1 → 3.1 | 1.0 → 4.7 | 0.8 → 4.0 | 0.8 → 5.5 |
| Items seen after 30 runs (of 517) | 50% = 259 | 144 → 95 | 148 → 67 | 136 → 72 | 142 → 107 |
| Deaths at the king / mid-run | | 1% / 0% → 35% / 2% | 4% / 1% → 57% / 19% | 0% / 0% → 70% / 1% | 0% / 0% → 38% / 2% |

¹ random never raises the Lavka tier, so at tier 1 with 30 runs of meta behind it, it ends up winning. Staying at tier 1 is a valid easy mode.
² Before tuning, every model won almost every run, including run 1.
³ Human time model, in seconds: a combat round is 1.2 s of measured animation at ×2 plus 4.5 s of thinking. Rooms 3, backroom loops 6, events 9, puzzle moves 1.6, lucky blocks 2.2, shop 8, run end 8, Lavka 12; one night shift a day. The UI runs agree: about 150 taps per run at roughly 1.5 s each, plus 47 s of animation, is about 4.5–5 minutes.

**50% of items:** about 4 new items per run means roughly 60–70 runs (5–6 hours of play). This is deliberately a long-term goal and is not reached within 30 runs.

### What I changed (and why)
- **The game was trivially easy.** Every model, including random, won about 95–100% from run 1. The cats' defence of 2 and 1 cancelled most early hits, and shield/heal spam could stall any fight forever. Once defence was lowered, the simulator hit a fight that never ended.
  - Cat defence 2/1 → 1/0. Purr heals 7 → 5, Пепося's purr shield 6/3 → 5/2, gear defence cap 2 → 1.
  - Enemies scale harder per floor (0.08 → 0.16) and per tier (0.3 → 0.55). Encounter budget is 2.4 + 0.45 per floor (was 1.6 + 0.35). Elites have ×1.8 HP.
  - The king has 155 HP and 8 ATK (was 96/7). His attack scales by tier at 0.25 (was a hard-coded 0.12).
  - **Enrage:** from round 14 (round 18 against the king), enemies gain +25% ATK every 3 rounds and the log says «Насекомым надоело ждать!». No fight can stall, and turtling stops being free.
  - Rest heals 35% (was 50%), knocked-out cats wake with 15% HP (was 25%), the king drops 1 consumable (was 2). Tier 1 has 10–11 floors (was 8–9).
- **The difficulty cliff.** The first tuning pass moved every death to the king, and newcomers needed 7–13 runs for a first win. Two fixes:
  - **Упрямство** (stubbornness): every loss in a row gives the cats +3 HP and +1 ATK per two stacks, up to 6 stacks. It resets on a win and is shown on the defeat screen and in the Lavka. Newcomers now win on run 3–5 without making the game easy for a good player.
  - Cheaper first upgrade levels (Аптечка 30, Тормозок 45, Рюкзак 50) so there's something to buy after run 1–2. Tiers are cheaper but harder (cost 150/300/600/1000, wins 1/2/4/7), so a good player keeps climbing into harder fights instead of steamrolling tier 1.
- **The album took about 25 runs per page and most careers never finished one.** Lucky blocks now favour unfound stickers of the three most-complete pages (40% of blocks whose rarity matches). The rarity roll itself is untouched. Combat stickers prefer enemies the album still needs, and the chance of an animal in a block went from 18% to 25%. The first page now arrives on run 8–10 (about 40 minutes) in 98–100% of careers.
- **Leader choice** at run start. Пепося leading gives +1 ATK to both cats; Дудоня leading gives +20% coins and +3 block luck. greedy uses Дудоня.

### First 30 minutes: satisfying things (share of careers reaching each within 30 simulated minutes)

| Milestone | greedy | cautious | smart |
|---|---|---|---|
| first animal guest | 100% (run 2) | 100% (run 2) | 100% (run 2) |
| first upgrade | 100% | 100% | 100% |
| first talent | 100% | 100% | 100% |
| first king defeated | 99% | 70% | 100% |
| Lavka tier 2 | 89% | 1% | 98% |
| first full album page | 17% | 8% | 25% |

Every model gets at least 3 different unlocks in the first 30 minutes (guest, upgrade, talent), and most also beat the king.

## 3. Room types

Counted by the simulator, per career of 30 runs (smart model; the others are similar, see `after_sim.json` → `roomsPer30Runs`):
combat 104, find 51, rest 37, event 34, king 30, backroom 22, elite 20, shelf 17, night shop 9, wash 8.

In the UI runs every type was played through taps: see the table in §1. Every type also has a screenshot in both profiles in `playtest/screens/{iphone,desktop}/`:

| Room | Screenshots |
|---|---|
| combat | `combat`, `combat_target`, `combat_item`, `combat_enemy` |
| king | `combat_boss` |
| find / lucky blocks | `reward_loot`, `reward_opened`, `reward_full` |
| backroom | `backroom` (first visit), `backroom_anomaly`, `backroom_missed`, `backroom_done`; night shift `night_start`, `night_walk`, `night_result`; `journal_anomalies`, `hub_anomaly` |
| shelf | `shelf`, `shelf_selected` |
| wash | `wash` |
| event | `event`, `event_done` |
| night shop | `shop` |
| rest | `rest`, `rest_done` |
| elite | `combat_enemy` |

Shelf and wash used to unlock only at tier 2, so a first session never saw them. They are now available from tier 1.

**Selling is an explicit step:**
- After a win, every find is listed with its price, its modifiers and «новая!» / «для альбома» tags. Each one has a Keep / Sell toggle, plus «Продать всё, кроме новых» and «Оставить всё». Default is keep.
- After a loss, you choose the one item to keep, and its price and modifiers are shown.
- When the backpack is full, the dialog shows the find and the sale price of every item. Consumable drops that don't fit used to be sold silently; they now wait as a closed block and ask.
- Selling never costs album progress: a sticker counts once it has been seen.

## 4. Is it fun? Item by item

**Decisions that matter in one run (yes, at least 5):**
1. Who leads: a combat bonus or coins and luck.
2. The route: an elite for loot or a rest and a safe path.
3. Each fight: target, shield or heal against the visible intents, and when to spend the tornado.
4. When to burn a consumable (Тапок правосудия on the king, or as an emergency heal).
5. Event risks, with luck checks.
6. Full-backpack trades.
7. What to sell and what to keep.

The difference between models shows these choices matter: smart wins 59%, greedy 22%, cautious 25%, with the same content.

**Combos as puzzles (partly).**
- Average discovered after 10 runs: smart 19.5, greedy 12.5, cautious 13.7, random 23.5 (button-mashing stumbles into action combos). By run 30, 23 of 43 combos are found in at least half of the careers.
- Changes made:
  - Action buttons now show `* ???`, or `* name` once known, when pressing them would complete a combo. A combo becomes visible before you know it.
  - The journal suggests the next combat combo to try.
  - The backpack shows «Почти комбо: …» when a set is one item short.
  - An animal's card shows the hint for its guest combo.
- Still hard: `dog_bone`, `hamster_stash`, `fox_cheese` and `royal_slipper` were found in under 1% of simulated careers. They need a specific guest plus a specific item, or finishing the king with an item. They're reachable, but no bot model goes for them; they're end-game puzzles.

**"One more run" pull (yes).**
- The Lavka and the run-end button show the nearest concrete goal, for example «Ещё 23 мон. до «Рюкзак побольше»», «Новых наклеек ждут альбома: 4», «Побед над королём до тира …: 1».
- After a loss there's stubbornness. Plus the daily gift with a gentle streak, the visible pity counter, album pages, and tiers.
- Modifiers per 1000 blocks: dirty 98, shiny 31, glitchy 35, cursed 27, golden 17, rainbow 5.

**Opening lucky blocks (good).** Shake → pause → flash in the rarity colour → rarity sound → the find pops out. Rarer finds take longer and get particles and screen shake. A tap skips. Pity is shown under every block row. 1000 simulated openings (`after_sim.json` → `blocks1000`):

| Rarity | luck 0 | luck 5 |
|---|---|---|
| common | 578 | 505 |
| uncommon | 215 | 250 |
| rare | 83 | 106 |
| epic | 87 | 101 |
| legendary | 36 | 34 |
| slop | 1 | 4 |

- 86 of the 1000 were pity-forced. The longest stretch without an epic was 9, as designed (guaranteed epic on the 10th, legendary on the 40th).
- 25% of blocks are animals.
- UI runs: 5.0 blocks per run, rarities 117 / 80 / 59 / 38 / 6 (common → legendary).
- Sound was not heard (headless), see §7.

**Humour and tone (checked by reading every text).**
- Rewritten: one reproach between the cats («Пепося, не ешь целиком, это неприлично» → «давай разделим пополам?»), one grim line («потеряли волю к жизни»), and the counter-wiping line in the Lavka greeting.
- New events lean into her taste for anomalies, but stay cozy: «Лишняя дверь», «Портрет с глазами», «Неправильный клобстер» with seven legs and a cup of tea, «Слишком тихий коридор», «Звонит телефон», «Мерцающая полка», «Отражение опаздывает».
- No fights or arguments between the cats, no chores-as-jokes, no sexual content, no sappy romance.

**Boring spots, and what was done about each:**

| Found | Fix |
|---|---|
| Combat round 3.1 s at ×1, no skipping | ~1.1 s at the new ×2 default, ~0.2 s with a tap (`measure_round.mjs`) |
| Anomaly waited 0.9 s before the result | Removed |
| Events: 33 in total, repeats only blocked within one run | Recently seen events are avoided across runs, and there are 7 new ones (40 total). In a 30-run career: 34 events, 31.1 distinct, an event shows up at most 1.8 times on average, and 25 events or more pass before one repeats. |
| Empty half-screens (event, wash, shelf, anomaly) | Content centred, cats added to events |
| The old anomaly room was a spot-the-difference grid with the rules printed on top | Replaced by the backroom, see §4b |

## 4b. The backroom (anomaly redesign)

The first «Аномалия» room was a 3×3 or 4×4 grid of identical icons with the task written on top («Неправильных предметов: 2…»). That is a spot-the-difference puzzle, not an anomaly game. It is now the **Подсобка**, built the way Exit 8 and I'm on Observation Duty work:

- **One familiar room.** A hand-made pixel scene (`data/backroom.json`, 25 objects): window with moon and stars, clock, wanted poster with a klobster, lamp, two shelves with jars and books, door, the cats' bed with Дудоня on it, a rug with Пепося, a box, a mouse hole. It never changes on its own.
- **No objective on screen.** Only the room, a small number on the wall, and two buttons: «Назад» and «Дальше». Just once, on the very first visit, Дудоня says «Запомни, как тут всё стоит. Если что-то будет не так — повернём назад». The very first loop ever is always the normal room, so it can be learned.
- **Loops.** Each loop is normal or holds one anomaly (55%). A right call moves the number up, a wrong one sends it back to 0 with a soft line («Кажется, что-то было не так…» / «Нет… Здесь всё было как обычно.»). A missed anomaly is not named, so it stays a mystery.
- **31 anomalies in three levels** (`data/anomalies.json`):
  - Obvious: red moon, clock without hands, klobster on the ceiling, lamp off with the whole room going dark, door ajar, poster upside down, eyes under the bed, daylight outside, a big silhouette in the window.
  - Medium: an extra jar, a missing jar, two jars swapped, the clock at 3:00, Пепося's shadow on the wrong side, Дудоня facing the wall, a green rug, light in the mouse hole, no stars, a book upside down, the door knob on the other side, the candle lit.
  - Subtle: the lamp slowly winking, a jar creeping towards the edge, rain in one pane only, a recoloured book, a crescent instead of a full moon, one floor seam missing, a window bar gone, the poster klobster looking the other way, a second mouse hole, the box shifted.
  - An anomaly is just a different object list. The painter never knows whether something is wrong, and a test checks that each of the 31 really changes the scene.
- **Where it lives.**
  - On the map: 3 loops on early floors (obvious and medium anomalies only), 4 loops with all levels from floor 6. Reward by grade: coins, plus a lucky block for a clean or nearly clean walk.
  - **«Ночная смена»** in the Lavka: 5 loops in a row, all levels. Full reward (30 coins, 3 sparkles, a lucky block) once a day. A shift that runs out of attempts doesn't use up the day's reward, so it can be retried.
  - The combo «Охотники за сокровищами» (backroom right after a find) now makes Дудоня prick up her ears once if something is off.
- **A collection.** Every anomaly caught goes into a new «Аномалии» tab of the journal: «???» until found, grouped by how noticeable it is. 34 entries: the 31 backroom ones plus 3 that live in the Lavka.
- **In the Lavka itself, rarely.** About 7% of days (after the second run), one of three hub anomalies quietly shows up in the Lavka scene: a red moon, a klobster creeping down from the ceiling, or eyes in the window. Nothing announces it; tapping it records it in the journal and gives sparkles. It is fixed per day, so reloading doesn't reroll it.

**Numbers.**

| Night shift grade (simulated, 100 careers × 2 shifts) | perfect | good | rough | failed |
|---|---|---|---|---|
| smart | 58 | 38 | 4 | 0 |
| cautious | 23 | 42 | 32 | 3 |
| greedy | 19 | 35 | 40 | 6 |
| random | 6 | 4 | 31 | 59 |

- The models notice an anomaly depending on its level: smart 97/88/70%, cautious 90/75/55%, greedy 85/60/35%, random 50%. They also raise false alarms on normal loops (5–15%, random 50%).
- UI runs: the bot played the backroom 49 times on the map and 26 night shifts, all through taps.
- Browser check: a night shift played through the UI. It confirms no objective on screen, the reset after a false alarm, the daily reward and the journal entry.

**Bug found in testing.** After a loop, the new buttons ignored taps during the 160 ms fade-in, so a fast tap simply didn't count. They now answer at once.

**Not verified.** How hard the subtle anomalies really are for a person. The detection rates above are guesses for the models; only a real player can say whether «Лишняя доска» is fair or invisible.

## 5. Screenshot review (both profiles, every screen)

`playtest/screens.mjs` takes 43 screens per profile and audits each one for:
- text clipped or wider than its box
- anything off-screen sideways
- tap targets under 44 px
- controls under the home indicator (iPhone safe area simulated as 44/34 px)
- fonts under 12 px

Final run: 49 screens per profile, 0 issues in both. I looked at the screenshots myself, and these were wrong even though the audit passed:

| Problem | Fix |
|---|---|
| **All headings rendered in a fallback serif.** The bundled `Galmuri11-Bold.ttf` has no Cyrillic glyphs at all. | Bold face removed; headings use the regular pixel font. A test now reads the font's cmap and checks every character used in the game. It also caught `−` and `✦` missing. |
| A literal «nullnull» next to the Sell button in item details | Fixed |
| Combo toasts covered the combat action buttons | Moved to the top |
| Lucky-card names cut off on both sides («решётчатый щиток») | Wraps, wider card |
| 4×4 anomaly grid overflowed the right edge on iPhone | Fixed |
| Desktop at 1366×768 used a ×2 UI zoom, so result and «Дальше» buttons were below the fold | Zoom threshold changed |
| HP numbers overflowed their bars at DPR 1 | Fixed |
| Map: the cats covered the bottom node's label | Fixed |
| Double title on the daily gift | Fixed |
| Locked skins nearly black | Fixed |
| Volume slider 32 px tall | Now 44 px |
| Number-key badges on top of map icons | Moved |
| Bug found while writing the bot: «Предмет» offered gear and silently destroyed it | Fixed |
| Bug found while writing the bot: the first service-worker install reloaded the page under a new player | Fixed |

Contact sheets: `playtest/contact/items_*.png` show all 517 items as sprite + name, `enemies_animals.png` shows all enemies and animals, and `backroom_*.png` shows the normal backroom next to every one of its 31 anomalies, all rendered by the game's own code.

## 6. Offline, saves, keyboard (`playtest/checks.mjs`, 39/39 pass, `results/checks.json`)

- **Offline, both profiles:** first load, then the 843 files are in the cache. With the network off, a reload and a full run work, with no external requests and no errors. Progress survives closing the page offline.
- **Saves:**
  - v1 and v2 saves migrate on a real page.
  - A corrupted save starts fresh with a message and keeps the broken copy for rescue.
  - A torn save falls back to the backup.
  - An edited save fails its checksum.
- **Hard kill:** `hardkill.mjs` SIGKILLs Chromium right after an action: 0 actions lost in 5 kills. Before the fix, 1 of 3 kills lost the last action.
- **Export and import:**
  - Windows: «Скачать файл», then import from that file on a clean profile.
  - Copy and paste of the text.
  - Garbage input is refused and progress is untouched.
  - iPhone: «Поделиться…» passes the file to the share sheet. The share sheet was stubbed; the real iOS sheet was not opened.
- **Keyboard:** Enter/Space confirm or skip an animation, number keys pick map nodes, actions and targets, Esc closes a dialog or goes back from the map.
- **Night shift:** played through the UI (see §4b).
- **Others:** the find room is locked until its block is opened; a full album page pays its reward through the UI; a new version shows «Обновить» and swaps the cache (buro-v42 → v43 in the test) with the save intact.

## 7. Not verified

- **No real iPhone or Windows machine.**
  - iPhone was emulated in Chromium and once in Playwright WebKit with touch, viewport and DPR 2.
  - The notch and home indicator are simulated with CSS variables, not real `env(safe-area-*)` values.
  - "Add to Home Screen", standalone mode and separate home-screen storage were not tested.
  - The real iOS share sheet and clipboard were not tested.
  - Installing the PWA from Chrome or Edge on Windows was not tested.
- **Sound was not heard.** It's headless; only the existence of every sound name is tested.
- **The human time per run is a model.** It's calibrated on measured animation time and bot taps, not on a person.
- **Fun numbers come from bot models, which don't learn.** A real newcomer probably wins earlier than greedy or cautious do. The good-player rate climbs to 60–70% after run 10 as meta accumulates.
- **Desktop window sizes:** only 1366×768 was checked in the bot and screenshots. The layout code handles other sizes, but they were not screenshotted.
