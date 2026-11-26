/** Everything that persists between sessions. Kept apart from gameplay so a shared shell can own it later. */
export interface SaveData {
  v: 1;
  /** Best stars per level id. */
  stars: Record<string, number>;
  sound: boolean;
  /** One-time tutorial hints already shown. */
  tips: Record<string, boolean>;
  /** Malware kinds the player has been briefed on. */
  seen: Record<string, boolean>;
}

const KEY = 'ttd.save.v1';

export function defaultSave(): SaveData {
  return { v: 1, stars: {}, sound: true, tips: {}, seen: {} };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = defaultSave();
    return { ...base, ...d, tips: { ...base.tips, ...(d.tips ?? {}) }, seen: { ...base.seen, ...(d.seen ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(d: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: progress lasts this session only */ }
}
