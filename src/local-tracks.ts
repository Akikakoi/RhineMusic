/**
 * 本地曲库：用户导入的音频本体存放在 IndexedDB（不使用 localStorage），
 * 刷新、重开与 PWA 更新后仍然存在。
 *
 * 播放链路以 `local:<id>` 作为 MusicTrack.file，由 audio.ts 解析成本地 object URL。
 * 本模块不依赖 audio.ts，只负责存储、元数据解析与 object URL 生命周期。
 */

export interface LocalTrackEntry {
  id: string;
  title: string;
  artist: string;
  duration: number;
  mime: string;
  size: number;
  addedAt: number;
}

interface LocalTrackRecord extends LocalTrackEntry {
  blob: Blob;
}

/** 曲库变更事件；detail 为最新的曲目列表。 */
export const LOCAL_TRACK_EVENT = "rhine-local-tracks";
/** 音频引擎里本地曲目的 file 前缀。 */
export const LOCAL_TRACK_PREFIX = "local:";
const DB_NAME = "rhine-local-tracks";
const STORE = "tracks";
const DB_VERSION = 1;

/** 存储不可用、读写失败等可读错误；message 直接展示给用户。 */
export class LocalTrackError extends Error {}

const objectUrls = new Map<string, string>();
let entries: LocalTrackEntry[] = [];

export const localTracksSupported = () => {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
};

export const localTrackEntries = () => entries;

/** 无分隔符或歌手为空时界面统一显示 UNKNOWN。 */
export const displayArtist = (artist: string) => artist.trim() || "UNKNOWN";

/**
 * 从文件名解析「艺术家 - 曲名」。支持 `-`、`–`、`—`：
 * 优先带空格的分隔符，其次任意位置的长破折号；没有分隔符时整名作标题、歌手留空。
 */
export function parseTrackName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[a-z0-9]+$/i, "").trim();
  const match =
    base.match(/^(.+?)\s+[-–—]\s+(.+)$/) ?? base.match(/^(.+?)\s*[–—]\s*(.+)$/);
  const artist = match?.[1]?.trim() ?? "";
  const title = (match?.[2] ?? base).trim();
  return { title: title || base || "UNTITLED", artist };
}

function message(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message.trim() : "";
  return text || fallback;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (!localTracksSupported())
    return Promise.reject(
      new LocalTrackError(
        "本地曲库不可用：当前浏览器未开放本地存储（隐私模式或已禁用站点数据）。",
      ),
    );
  if (dbPromise) return dbPromise;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(
        new LocalTrackError(
          message(error, "本地曲库不可用：无法打开浏览器数据库。"),
        ),
      );
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () =>
      reject(
        new LocalTrackError(
          message(request.error, "本地曲库不可用：浏览器数据库打开失败。"),
        ),
      );
    request.onblocked = () =>
      reject(new LocalTrackError("本地曲库不可用：数据库被其他标签页占用。"));
  });
  dbPromise = promise;
  void promise.catch(() => {
    if (dbPromise === promise) dbPromise = undefined;
  });
  return promise;
}

const strip = (record: LocalTrackRecord): LocalTrackEntry => ({
  id: record.id,
  title: record.title,
  artist: record.artist,
  duration: record.duration,
  mime: record.mime,
  size: record.size,
  addedAt: record.addedAt,
});

async function readAll(): Promise<LocalTrackRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () =>
      resolve((request.result as LocalTrackRecord[] | undefined) ?? []);
    request.onerror = () =>
      reject(new LocalTrackError(message(request.error, "本地曲库读取失败。")));
  });
}

async function readOne(id: string): Promise<LocalTrackRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    request.onsuccess = () =>
      resolve(request.result as LocalTrackRecord | undefined);
    request.onerror = () =>
      reject(new LocalTrackError(message(request.error, "本地曲库读取失败。")));
  });
}

async function write(record: LocalTrackRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        new LocalTrackError(
          message(transaction.error, "本地曲库写入失败：浏览器存储空间可能已满。"),
        ),
      );
    transaction.onabort = () =>
      reject(
        new LocalTrackError(
          message(transaction.error, "本地曲库写入失败：存储空间不足或事务被中止。"),
        ),
      );
  });
}

async function erase(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new LocalTrackError(message(transaction.error, "本地曲库删除失败。")));
  });
}

function announce(next: LocalTrackEntry[]) {
  entries = next;
  window.dispatchEvent(new CustomEvent(LOCAL_TRACK_EVENT, { detail: next }));
}

/** 订阅曲库变更；订阅时立即回调一次当前值。 */
export function subscribeLocalTracks(
  listener: (entries: LocalTrackEntry[]) => void,
) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<LocalTrackEntry[]>).detail);
  window.addEventListener(LOCAL_TRACK_EVENT, handler);
  listener(entries);
  return () => window.removeEventListener(LOCAL_TRACK_EVENT, handler);
}

export async function listLocalTracks(): Promise<LocalTrackEntry[]> {
  const records = await readAll();
  return records
    .map(strip)
    .sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : 1));
}

/** 已缓存的 object URL；音频引擎是同步取用的，取不到时空串交由引擎报错。 */
export const cachedLocalObjectUrl = (id: string) => objectUrls.get(id);

export async function localObjectUrl(id: string): Promise<string> {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const record = await readOne(id);
  if (!record) throw new LocalTrackError("本地曲目已不存在。");
  const url = URL.createObjectURL(record.blob);
  objectUrls.set(id, url);
  return url;
}

/** 播放列表重建前预热 object URL，保证引擎同步取用。 */
export async function primeLocalObjectUrls(ids: string[]) {
  await Promise.all(ids.map((id) => localObjectUrl(id).catch(() => "")));
}

function revoke(id: string) {
  const url = objectUrls.get(id);
  if (!url) return;
  URL.revokeObjectURL(url);
  objectUrls.delete(id);
}

export function revokeAllLocalObjectUrls() {
  for (const id of [...objectUrls.keys()]) revoke(id);
}

window.addEventListener("pagehide", (event) => {
  // bfcache 恢复时 object URL 仍需可用，只有真正卸载才回收。
  if (!(event as PageTransitionEvent).persisted) revokeAllLocalObjectUrls();
});

/** 列表 + 预热 + 广播，是启动与增删改后统一的刷新入口。 */
export async function refreshLocalTracks(): Promise<LocalTrackEntry[]> {
  const next = await listLocalTracks();
  await primeLocalObjectUrls(next.map((entry) => entry.id));
  announce(next);
  return next;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

function mimeOf(file: File) {
  if (file.type) return file.type;
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "";
}

let decoder: AudioContext | undefined;

/** 用解码器兜底读取时长（音频元素读不到元数据时，例如部分无索引的容器）。 */
async function decodeDuration(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  try {
    decoder ??= new AudioContext();
    const decoded = await decoder.decodeAudioData(buffer);
    return decoded.duration;
  } catch (error) {
    decoder?.close().catch(() => {});
    decoder = undefined;
    throw error;
  }
}

/** 读取真实时长；无法解码时抛出可读错误。 */
async function readDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const element = document.createElement("audio");
      element.preload = "metadata";
      element.addEventListener("loadedmetadata", () =>
        resolve(element.duration),
      );
      element.addEventListener("error", () => reject(new Error("metadata")));
      element.src = url;
    });
    if (Number.isFinite(duration) && duration > 0) return duration;
  } catch {
    /* 落到解码兜底 */
  } finally {
    URL.revokeObjectURL(url);
  }
  const decoded = await decodeDuration(file);
  if (!Number.isFinite(decoded) || decoded <= 0) throw new Error("duration");
  return decoded;
}

function newId() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, "").slice(0, 16);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 导入一个文件：解析「艺术家 - 曲名」、读取真实时长并写入 IndexedDB。 */
export async function addLocalTrack(file: File): Promise<LocalTrackEntry> {
  if (!file.size)
    throw new LocalTrackError(`无法导入「${file.name}」：文件为空。`);
  const { title, artist } = parseTrackName(file.name);
  let duration: number;
  try {
    duration = await readDuration(file);
  } catch {
    throw new LocalTrackError(
      `无法导入「${file.name}」：音频格式不受支持或文件已损坏。`,
    );
  }
  const record: LocalTrackRecord = {
    id: newId(),
    title,
    artist,
    duration,
    mime: mimeOf(file),
    size: file.size,
    addedAt: Date.now(),
    blob: file,
  };
  await write(record);
  await localObjectUrl(record.id).catch(() => "");
  announce(await listLocalTracks());
  return strip(record);
}

/** 手动编辑标题与歌手；空标题保留原值。 */
export async function updateLocalTrack(
  id: string,
  patch: { title?: string; artist?: string },
): Promise<LocalTrackEntry> {
  const record = await readOne(id);
  if (!record) throw new LocalTrackError("本地曲目已不存在。");
  const title = patch.title?.trim();
  const next: LocalTrackRecord = {
    ...record,
    title: title || record.title,
    artist: patch.artist === undefined ? record.artist : patch.artist,
  };
  await write(next);
  announce(await listLocalTracks());
  return strip(next);
}

/**
 * 删除曲目并回收 object URL。
 * 广播先于回收执行，让音频引擎有时间切走正在播放的这一条，避免中途断源报错。
 */
export async function removeLocalTrack(id: string): Promise<LocalTrackEntry[]> {
  await erase(id);
  const next = await listLocalTracks();
  announce(next);
  setTimeout(() => revoke(id), 1000);
  return next;
}
