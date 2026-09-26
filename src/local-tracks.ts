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
  /** 是否有内嵌专辑封面；旧条目没有这个字段时按无封面（留空）处理。 */
  cover?: boolean;
  /**
   * 阵列占位槽序号（0 = records 顺序里的第一个占位槽），由 main.ts 在导入时定下。
   * 随条目持久保存，删掉别的一首不会让剩下的歌换方块；旧条目没有这个字段时
   * 由 data.ts 按列表顺序补最小的空槽。
   */
  slot?: number;
}

interface LocalTrackRecord extends LocalTrackEntry {
  blob: Blob;
  /** 从音频内嵌元数据提取的封面原图；没有封面时缺省。 */
  coverBlob?: Blob;
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
/** 封面 object URL 与音频分开管理：封面只在卡片印刷面上取用，两者生命周期互不牵连。 */
const coverObjectUrls = new Map<string, string>();
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
  cover: Boolean(record.coverBlob),
  slot: record.slot,
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

/** 已缓存的封面 object URL；卡片印刷面是同步取用的，取不到时按无封面处理。 */
export const cachedLocalCoverUrl = (id: string) => coverObjectUrls.get(id);

export async function localCoverUrl(id: string): Promise<string> {
  const cached = coverObjectUrls.get(id);
  if (cached) return cached;
  const record = await readOne(id);
  if (!record) throw new LocalTrackError("本地曲目已不存在。");
  if (!record.coverBlob) throw new LocalTrackError("本地曲目没有内嵌封面。");
  const url = URL.createObjectURL(record.coverBlob);
  coverObjectUrls.set(id, url);
  return url;
}

/**
 * 播放列表重建前预热 object URL，保证引擎与卡片印刷面都能同步取用。
 * 每条只读一次记录：音频与封面各建一个 object URL，失败时按空处理。
 */
export async function primeLocalObjectUrls(ids: string[]) {
  await Promise.all(
    ids.map(async (id) => {
      try {
        const record = await readOne(id);
        if (!record) return;
        if (!objectUrls.has(id))
          objectUrls.set(id, URL.createObjectURL(record.blob));
        if (record.coverBlob && !coverObjectUrls.has(id))
          coverObjectUrls.set(id, URL.createObjectURL(record.coverBlob));
      } catch {
        /* 取不到时空着，交由引擎与印刷面各自按无源/无封面处理 */
      }
    }),
  );
}

function revoke(id: string) {
  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }
  const cover = coverObjectUrls.get(id);
  if (cover) {
    URL.revokeObjectURL(cover);
    coverObjectUrls.delete(id);
  }
}

export function revokeAllLocalObjectUrls() {
  for (const id of [...objectUrls.keys(), ...coverObjectUrls.keys()]) revoke(id);
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

/* ----------------------------------------------------------- 内嵌封面解析 */

// 只取音频文件自带的封面（mp3 的 ID3v2 APIC/PIC、mp4/m4a 的 covr、flac 的 PICTURE），
// 零依赖手写解析，风格与 scripts/generate-audio-manifest.mjs 的 mp3 时长解析一致。
// 格式不匹配、解析失败或图片类型不受支持一律返回 null：导入不因此失败。

const COVER_MIME = /^image\/(jpeg|png|webp|gif)$/i;
/** 封面原图字节上限；超限当作没有封面，避免把超大图塞进 IndexedDB。 */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

interface CoverImage {
  mime: string;
  data: Uint8Array;
}

const u32be = (bytes: Uint8Array, offset: number) =>
  (((bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>>
    0);

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** ID3v2 同步安全整数：每字节只用低 7 位。 */
const id3Size = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] & 0x7f) << 21) |
  ((bytes[offset + 1] & 0x7f) << 14) |
  ((bytes[offset + 2] & 0x7f) << 7) |
  (bytes[offset + 3] & 0x7f);

/** APIC/PIC 帧体：编码 → MIME → 图片类型 → 描述（按编码以 0 收尾）→ 图片字节。 */
function apicPayload(
  bytes: Uint8Array,
  start: number,
  end: number,
  legacy: boolean,
): CoverImage | null {
  if (start >= end) return null;
  const encoding = bytes[start];
  let offset = start + 1;
  let mime: string;
  if (legacy) {
    mime = `image/${ascii(bytes, offset, 3).toLowerCase()}`;
    offset += 3;
  } else {
    let mimeEnd = offset;
    while (mimeEnd < end && bytes[mimeEnd] !== 0) mimeEnd++;
    mime = new TextDecoder("latin1").decode(bytes.subarray(offset, mimeEnd));
    offset = mimeEnd + 1;
  }
  offset += 1; // picture type
  if (encoding === 1 || encoding === 2) {
    while (offset + 1 < end && !(bytes[offset] === 0 && bytes[offset + 1] === 0))
      offset += 2;
    offset += 2;
  } else {
    while (offset < end && bytes[offset] !== 0) offset++;
    offset += 1;
  }
  if (offset >= end) return null;
  return { mime: mime || "image/jpeg", data: bytes.subarray(offset, end) };
}

function coverFromId3(bytes: Uint8Array): CoverImage | null {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return null;
  const major = bytes[3];
  const flags = bytes[5];
  const end = Math.min(bytes.length, 10 + id3Size(bytes, 6));
  let offset = 10;
  if (flags & 0x40)
    // 扩展头：v2.3 是 4 字节长度（不含自身），v2.4 是同步安全长度（含自身）
    offset += major >= 4 ? id3Size(bytes, offset) : u32be(bytes, offset) + 4;
  const headerSize = major === 2 ? 6 : 10;
  while (offset + headerSize <= end) {
    const id =
      ascii(bytes, offset, 3) + (major === 2 ? "" : ascii(bytes, offset + 3, 1));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break; // 帧区结束（通常是一串 0）
    const size =
      major === 2
        ? (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5]
        : major === 4
          ? id3Size(bytes, offset + 4)
          : u32be(bytes, offset + 4);
    const body = offset + headerSize;
    if (size <= 0 || body + size > end) break;
    if (id === "APIC" || id === "PIC")
      return apicPayload(bytes, body, body + size, id === "PIC");
    offset = body + size;
  }
  return null;
}

interface Atom {
  type: string;
  start: number;
  end: number;
}

/** 顺序扫描一段子原子列表；size 为 0 表示直到末尾。 */
function atoms(bytes: Uint8Array, start: number, end: number): Atom[] {
  const list: Atom[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = u32be(bytes, offset);
    if (size === 0) size = end - offset;
    if (size < 8 || offset + size > end) break;
    list.push({ type: ascii(bytes, offset + 4, 4), start: offset + 8, end: offset + size });
    offset += size;
  }
  return list;
}

function coverFromMp4(bytes: Uint8Array): CoverImage | null {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const moov = atoms(bytes, 0, bytes.length).find((atom) => atom.type === "moov");
  const udta = moov && atoms(bytes, moov.start, moov.end).find((a) => a.type === "udta");
  // meta 是完整盒：4 字节 version/flags 之后才是子原子
  const meta = udta && atoms(bytes, udta.start, udta.end).find((a) => a.type === "meta");
  const ilst = meta && atoms(bytes, meta.start + 4, meta.end).find((a) => a.type === "ilst");
  const covr = ilst && atoms(bytes, ilst.start, ilst.end).find((a) => a.type === "covr");
  const data = covr && atoms(bytes, covr.start, covr.end).find((a) => a.type === "data");
  if (!data) return null;
  // data 盒：version/flags(4) + locale(4)，低字节 13=JPEG、14=PNG
  const kind = u32be(bytes, data.start) & 0xff;
  return {
    mime: kind === 14 ? "image/png" : "image/jpeg",
    data: bytes.subarray(data.start + 8, data.end),
  };
}

function coverFromFlac(bytes: Uint8Array): CoverImage | null {
  if (bytes.length < 8 || ascii(bytes, 0, 4) !== "fLaC") return null;
  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const size =
      (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const body = offset + 4;
    if (body + size > bytes.length) break;
    if ((header & 0x7f) === 6) {
      // PICTURE：类型 → MIME → 描述 → 宽/高/色深/颜色数 → 图片字节
      let cursor = body + 4;
      const mimeLength = u32be(bytes, cursor);
      const mime = new TextDecoder("latin1").decode(
        bytes.subarray(cursor + 4, cursor + 4 + mimeLength),
      );
      cursor += 4 + mimeLength;
      cursor += 4 + u32be(bytes, cursor) + 16;
      const dataLength = u32be(bytes, cursor);
      return {
        mime: mime || "image/jpeg",
        data: bytes.subarray(cursor + 4, cursor + 4 + dataLength),
      };
    }
    offset = body + size;
    if (header & 0x80) break; // 最后一个元数据块
  }
  return null;
}

function parseCover(bytes: Uint8Array): CoverImage | null {
  try {
    return coverFromId3(bytes) ?? coverFromMp4(bytes) ?? coverFromFlac(bytes);
  } catch {
    return null;
  }
}

/** 从音频文件提取内嵌封面；没有或无法解析时返回 null，不抛错。 */
async function extractCover(file: File): Promise<Blob | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
  const found = parseCover(bytes);
  if (!found || found.data.length === 0 || found.data.length > MAX_COVER_BYTES)
    return null;
  const mime = COVER_MIME.test(found.mime) ? found.mime : "image/jpeg";
  return new Blob([found.data as unknown as BlobPart], { type: mime });
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

/**
 * 导入一个文件：解析「艺术家 - 曲名」、读取真实时长并写入 IndexedDB。
 * slot 是调用方（main.ts）挑好的阵列占位槽序号，随条目一起保存。
 */
export async function addLocalTrack(
  file: File,
  slot?: number,
): Promise<LocalTrackEntry> {
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
  const coverBlob = await extractCover(file);
  const record: LocalTrackRecord = {
    id: newId(),
    title,
    artist,
    duration,
    mime: mimeOf(file),
    size: file.size,
    addedAt: Date.now(),
    blob: file,
    ...(typeof slot === "number" ? { slot } : {}),
    ...(coverBlob ? { coverBlob } : {}),
  };
  await write(record);
  await localObjectUrl(record.id).catch(() => "");
  if (coverBlob) await localCoverUrl(record.id).catch(() => "");
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
