// LRC 歌词：按 URL 取用并缓存。文件放在 public/lyrics/，由 tracks.json 的 lyrics 字段指定文件名。
// 本模块不依赖其他源码，方便在 Node 里直接跑解析用例。
export interface LyricLine {
  time: number;
  text: string;
}

const cache = new Map<string, LyricLine[] | null>();
const pending = new Map<string, Promise<LyricLine[] | null>>();

/** 解析 LRC：一行可带多个时间标签；[ti:]、[ar:] 等元信息行忽略。 */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function loadLyrics(url: string | null | undefined): Promise<LyricLine[] | null> {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const existing = pending.get(url);
  if (existing) return existing;
  const request = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Lyrics ${url}: ${response.status}`);
      return response.text();
    })
    .then((text) => parseLrc(text))
    .catch(() => null)
    .then((lines) => {
      const value = lines && lines.length ? lines : null;
      cache.set(url, value);
      pending.delete(url);
      return value;
    });
  pending.set(url, request);
  return request;
}

/** 当前时间对应的歌词行下标；未到第一行时返回 -1。 */
export function activeLyric(lines: LyricLine[], time: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time + 0.05) index = i;
    else break;
  }
  return index;
}

export function formatLyricTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
