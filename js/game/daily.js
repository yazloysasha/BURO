// Daily free lucky block (one per local calendar day, no timers) and a gentle streak.

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// whole days from date string a to date string b (YYYY-MM-DD)
export function dayDiff(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export const STREAK_BONUSES = [3, 7, 14];

export function dailyAvailable(save, today) {
  const last = save.daily.lastOpenDate;
  return !last || dayDiff(last, today) > 0;
}

// Marks today's gift as claimed and updates the streak. Missing days lowers the streak by one per missed day,
// never below 1 — it never resets to zero. Returns {streak, bonuses:[threshold|'weekN']}.
export function claimDaily(save, today) {
  const d = save.daily;
  if (!dailyAvailable(save, today)) return null;
  if (!d.lastOpenDate) d.streak = 1;
  else {
    const diff = dayDiff(d.lastOpenDate, today);
    if (diff === 1) d.streak += 1;
    else d.streak = Math.max(1, d.streak - (diff - 1));
  }
  d.lastOpenDate = today;
  d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
  // thresholds can be earned again after the streak dipped below them
  d.claimedBonuses = (d.claimedBonuses || []).filter((b) => typeof b !== 'number' || b <= d.streak);
  const bonuses = [];
  for (const t of STREAK_BONUSES) {
    if (d.streak >= t && !d.claimedBonuses.includes(t)) {
      d.claimedBonuses.push(t);
      bonuses.push(t);
    }
  }
  if (d.streak > 14 && d.streak % 7 === 0) bonuses.push('week');
  return { streak: d.streak, bonuses };
}
