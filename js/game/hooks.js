// Extension points for systems layered on top of runs (combos, stickers), kept import-free to avoid cycles.
// combat: factories (save, data, run, actions) -> combat hooks; afterWin: (save, data, run, room, helpers) -> void
export const runHooks = { combat: [], afterWin: [] };
