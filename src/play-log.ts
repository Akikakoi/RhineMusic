// 本次终端的播放记录：写入 localStorage，详情页签读取。只记录真实起播的曲目。
export interface PlayEntry {
  id: string;
  title: string;
  artist: string;
  at: number;
}

const KEY = "rhine-play-log";
const LIMIT = 40;

export function readPlayLog(): PlayEntry[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is PlayEntry =>
        !!entry && typeof entry.id === "string" && typeof entry.title === "string",
    );
  } catch {
    return [];
  }
}

/** 追加一条播放记录；同一曲目连续重复播放只保留最近一条。 */
export function appendPlayLog(entry: PlayEntry): PlayEntry[] {
  const entries = [entry, ...readPlayLog().filter((item) => item.id !== entry.id)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {}
  return entries;
}

export function clearPlayLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export function formatPlayTime(at: number) {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
