/**
 * 命名播放列表：只存曲目标识，不复制音频本体。
 *
 * `tracks` 用 audio.ts 的 `musicTrackKey`——站点曲目是文件名（.ogg / .mp3 归一化），
 * 本地导入曲目是 `local:<id>`。这样本地曲库增删、改标题都不会让列表错位；
 * 指向已删除本地曲目的条目由 audio.ts 的队列解析自动跳过，界面上另提示失效数量。
 */

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  /** musicTrackKey 列表，顺序即播放顺序。 */
  tracks: string[];
}

/** 播放列表变更事件；detail 为最新的列表数组。 */
export const PLAYLIST_EVENT = "rhine-playlists";

const STORAGE_KEY = "rhine-playlists";
const MAX_LISTS = 24;
const MAX_TRACKS = 200;
const MAX_NAME = 24;

const clone = (list: Playlist): Playlist => ({
  id: list.id,
  name: list.name,
  createdAt: list.createdAt,
  tracks: [...list.tracks],
});

function newId() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, "").slice(0, 12);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 名称统一：去首尾空格、折叠内部空白、截断到上限；空名给出稳定的占位名。 */
function sanitizeName(name: string) {
  const trimmed = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return trimmed;
}

function sanitizeTrackKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length >= MAX_TRACKS) break;
  }
  return keys;
}

function read(): Playlist[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const lists: Playlist[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<Playlist>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const name = typeof record.name === "string" ? sanitizeName(record.name) : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    lists.push({
      id,
      name,
      createdAt:
        typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
          ? record.createdAt
          : Date.now(),
      tracks: sanitizeTrackKeys(record.tracks),
    });
    if (lists.length >= MAX_LISTS) break;
  }
  return lists;
}

let lists: Playlist[] = read();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    /* 存储不可用（隐私模式 / 配额）时列表只活在本会话 */
  }
}

function announce() {
  window.dispatchEvent(
    new CustomEvent(PLAYLIST_EVENT, { detail: lists.map(clone) }),
  );
}

export const listPlaylists = () => lists.map(clone);

export const getPlaylist = (id: string) =>
  lists.find((list) => list.id === id);

/** 订阅变更；订阅时立即回调一次当前值。 */
export function subscribePlaylists(
  listener: (lists: Playlist[]) => void,
) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<Playlist[]>).detail);
  window.addEventListener(PLAYLIST_EVENT, handler);
  listener(lists.map(clone));
  return () => window.removeEventListener(PLAYLIST_EVENT, handler);
}

/**
 * 新建列表；到达上限或名称无效时返回 null。
 * `tracks` 是初始曲目（新建时传整个曲库的标识，列表一次填满，再由用户删减）。
 */
export function createPlaylist(name: string, tracks: string[] = []): Playlist | null {
  const clean = sanitizeName(name);
  if (!clean || lists.length >= MAX_LISTS) return null;
  const list: Playlist = {
    id: newId(),
    name: clean,
    createdAt: Date.now(),
    tracks: sanitizeTrackKeys(tracks),
  };
  lists = [...lists, list];
  persist();
  announce();
  return { ...list };
}

export function renamePlaylist(id: string, name: string): boolean {
  const clean = sanitizeName(name);
  const index = lists.findIndex((list) => list.id === id);
  if (index < 0 || !clean) return false;
  if (lists[index].name === clean) return true;
  lists = lists.map((list, i) => (i === index ? { ...list, name: clean } : list));
  persist();
  announce();
  return true;
}

export function removePlaylist(id: string): boolean {
  const next = lists.filter((list) => list.id !== id);
  if (next.length === lists.length) return false;
  lists = next;
  persist();
  announce();
  return true;
}

export type AddResult = "added" | "exists" | "full" | "missing";

export function addToPlaylist(id: string, key: string): AddResult {
  const index = lists.findIndex((list) => list.id === id);
  if (index < 0) return "missing";
  const clean = key.trim();
  if (!clean) return "missing";
  const list = lists[index];
  if (list.tracks.includes(clean)) return "exists";
  if (list.tracks.length >= MAX_TRACKS) return "full";
  const tracks = [...list.tracks, clean];
  lists = lists.map((item, i) => (i === index ? { ...item, tracks } : item));
  persist();
  announce();
  return "added";
}

export function removeFromPlaylist(id: string, key: string): boolean {
  const index = lists.findIndex((list) => list.id === id);
  if (index < 0) return false;
  const list = lists[index];
  if (!list.tracks.includes(key)) return false;
  const tracks = list.tracks.filter((item) => item !== key);
  lists = lists.map((item, i) => (i === index ? { ...item, tracks } : item));
  persist();
  announce();
  return true;
}

/** 上移 / 下移一条；direction 为 -1 或 1。到了边界返回 false。 */
export function moveInPlaylist(id: string, key: string, direction: -1 | 1): boolean {
  const index = lists.findIndex((list) => list.id === id);
  if (index < 0) return false;
  const list = lists[index];
  const from = list.tracks.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.tracks.length) return false;
  const tracks = [...list.tracks];
  [tracks[from], tracks[to]] = [tracks[to], tracks[from]];
  lists = lists.map((item, i) => (i === index ? { ...item, tracks } : item));
  persist();
  announce();
  return true;
}
