// Prints the Markdown tables of REPORT_PLAYTEST.md from the saved bot runs. Usage: node playtest/report_tables.mjs
import fs from 'node:fs';
const load = (f) => JSON.parse(fs.readFileSync(new URL('./results/' + f, import.meta.url), 'utf8'));
const runsOf = (d) => d.flatMap((c) => c.results);
const iphone = load('after_ui_iphone.json');
const desktop = load('after_ui_desktop.json');
const before = load('before_ui.json');
const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
const NAMES = { combat: 'бой', elite: 'гнездо', boss: 'король' };
const row = (r, profile) => `| ${profile} | ${r.strategy} | ${r.seed} | ${r.index + 1} | ${r.tier} | ${r.fee} | ${r.reachedBoss ? 'да' : 'нет'} | ${r.outcome === 'win' ? 'победа' : `${NAMES[r.diedIn] || r.diedIn}, этаж ${r.floor}/${r.total}`} | ${r.earned} | ${r.sold || 0} | ${r.roomOrder.length} | ${r.taps} | ${Math.round(r.seconds)} |`;
console.log('| Профиль | Стратегия | Сид | Забег | Тир | Взнос | Дошёл до босса | Итог | Монет домой | из них продажа | Комнат | Тапов | Секунд бота |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of runsOf(iphone)) console.log(row(r, 'iPhone'));
for (const r of runsOf(desktop)) console.log(row(r, 'Windows'));
const all = [...runsOf(iphone), ...runsOf(desktop)];
console.log('\n### Сводка UI-прогонов\n\n| Набор | Забегов | Побед | До босса | Монет домой | Тапов | Комнат | Секунд бота | Ошибок | Внешних запросов |\n|---|---|---|---|---|---|---|---|---|---|');
const sum = (label, data) => {
  const rr = runsOf(data);
  console.log(`| ${label} | ${rr.length} | ${pct(rr.filter((r) => r.outcome === 'win').length, rr.length)} | ${pct(rr.filter((r) => r.reachedBoss).length, rr.length)} | ${Math.round(avg(rr.map((r) => r.earned)))} | ${Math.round(avg(rr.map((r) => r.taps)))} | ${avg(rr.map((r) => r.roomOrder.length)).toFixed(1)} | ${Math.round(avg(rr.map((r) => r.seconds)))} | ${data.flatMap((c) => c.problems).length} | ${data.flatMap((c) => c.external).length} |`);
};
sum('до баланса, iPhone', before);
sum('после, iPhone', iphone);
sum('после, Windows', desktop);
for (const name of ['random', 'greedy', 'cautious', 'smart']) sum('после, ' + name, [...iphone, ...desktop].map((c) => ({ ...c, results: c.results.filter((r) => r.strategy === name) })).filter((c) => c.strategy === name));
console.log('\n### Типы комнат в UI-прогонах\n\n| Комната | Посещений |\n|---|---|');
const rooms = {};
for (const r of all) for (const t of r.roomOrder) rooms[t] = (rooms[t] || 0) + 1;
for (const [k, v] of Object.entries(rooms).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${v} |`);
console.log('\n### События в UI-прогонах\n');
const ev = {};
for (const r of all) for (const id of r.events) ev[id] = (ev[id] || 0) + 1;
const counts = Object.values(ev);
console.log(`Всего встреч: ${counts.reduce((a, b) => a + b, 0)}, разных событий: ${counts.length} из 40, больше всего одно и то же: ${Math.max(...counts)} раз.`);
console.log('\n### Редкости открытых блоков в UI-прогонах\n');
const rar = {};
for (const r of all) for (const [k, v] of Object.entries(r.rarity)) rar[k] = (rar[k] || 0) + v;
console.log(JSON.stringify(rar));
console.log('Блоков за забег: ' + avg(all.map((r) => r.blocks)).toFixed(1));
const firstWin = {};
for (const c of iphone) {
  const i = c.results.findIndex((r) => r.outcome === 'win');
  (firstWin[c.strategy] = firstWin[c.strategy] || []).push(i < 0 ? '—' : i + 1);
}
console.log('\nПервая победа по карьерам (UI, 4 забега на карьеру): ' + JSON.stringify(firstWin));
