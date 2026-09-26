import content from "../content/tracks.json" with { type: "json" };
import { cachedLocalCoverUrl, type LocalTrackEntry } from "./local-tracks.ts";

// RhineMusic：阵列内容源已从档案记录换为曲库。函数名沿用 data.ts 的既有约定，
// 使 archive-loop.ts、scene.ts 的阵列与槽位逻辑无需改动。
// 曲目分两类：已入库（duration/file 有值，可播放）与占位（pending，用于撑满五列各八份）。
//
// 本轮起这一层是可更新的：tracks.json 仍是槽位几何、编号与列归属的唯一来源，
// 本地曲库（IndexedDB）只把占位槽的内容换成导入文件，40 槽结构、每列八份与
// 稳定编号都不动。因此 records 的元素会被就地替换，数组本身与长度永远不变。
export interface TrackRecord {
  id: string;
  title: string;
  artist: string;
  category: string;
  duration: number | null;
  file: string | null;
  pending: boolean;
  /** public/lyrics/ 下的 LRC 文件名；没有歌词时缺省。 */
  lyrics?: string | null;
  /** 本地曲目内嵌封面的 object URL；只在卡片印刷面上取用，无封面时缺省。 */
  coverUrl?: string;
  /** 本地曲库条目 id；占位槽被导入曲目填充时才有值。 */
  localId?: string;
}

/** tracks.json 的静态内容，运行时不改写。 */
const baseRecords: TrackRecord[] = content.tracks;
/**
 * 对外暴露的曲目列表：长度与顺序永远等于 tracks.json（40 槽、五列各八份），
 * 只有被本地曲目覆盖的占位槽换成导入文件的内容。就地替换元素，
 * 让 scene.ts / archive-loop.ts / main.ts 手里已有的引用与下标始终有效。
 */
export const records: TrackRecord[] = baseRecords.map((record) => ({ ...record }));
export const categories = ["全部曲目", ...content.columns];
export const archiveColumns = content.columns;

/** records 顺序里的占位槽下标；本地曲目按这个顺序依次填充。 */
const pendingSlotIndexes = baseRecords
  .map((record, index) => (record.pending ? index : -1))
  .filter((index) => index >= 0);
/** 可被本地曲目填充的槽位总数（当前 34）。 */
export const localSlotCapacity = pendingSlotIndexes.length;

const listeners = new Set<() => void>();
let usedSlots = new Set<number>();

/** artist 为空时的显示值与 local-tracks.displayArtist 一致（界面显示 UNKNOWN）。 */
const localArtist = (artist: string) => artist.trim() || "UNKNOWN";

/**
 * 给每条本地曲目分配一个占位槽序号（0 = records 顺序里的第一个占位槽）。
 * 条目自带 slot 时优先沿用——删掉别的一首不会让剩下的歌换方块；
 * 没有 slot 的旧条目（上一轮导入的）按列表顺序补最小的空槽。
 */
function planLocalSlots(entries: LocalTrackEntry[]) {
  const plan = new Map<string, number>();
  const taken = new Set<number>();
  for (const entry of entries) {
    const slot = entry.slot;
    if (
      typeof slot === "number" &&
      Number.isInteger(slot) &&
      slot >= 0 &&
      slot < localSlotCapacity &&
      !taken.has(slot)
    ) {
      plan.set(entry.id, slot);
      taken.add(slot);
    }
  }
  for (const entry of entries) {
    if (plan.has(entry.id)) continue;
    let slot = 0;
    while (taken.has(slot)) slot++;
    if (slot >= localSlotCapacity) break;
    plan.set(entry.id, slot);
    taken.add(slot);
  }
  return plan;
}

/** 当前占位槽占用情况；设置面板显示「3 / 34 已使用」。 */
export const localSlotState = () => ({
  capacity: localSlotCapacity,
  used: usedSlots.size,
  remaining: localSlotCapacity - usedSlots.size,
});

/** 下一个空闲占位槽序号；占位槽用尽时返回 null。 */
export function nextLocalSlot(): number | null {
  for (let slot = 0; slot < localSlotCapacity; slot++)
    if (!usedSlots.has(slot)) return slot;
  return null;
}

/**
 * 把本地曲目覆盖到占位槽：槽位本身（列、行、编号 RM-0xx）沿用原占位曲目，
 * 曲名、歌手、时长与音源换成导入文件的内容，并把 file 写成 `local:<id>`，
 * 于是 playlistIndex() 会按稳定标识自动命中播放列表里的那一条。
 * 传空列表（删除、曲库不可用）时全部回到 tracks.json 的原始占位数据。
 */
export function applyLocalTracks(entries: LocalTrackEntry[]) {
  const plan = planLocalSlots(entries);
  const bySlot = new Map<number, LocalTrackEntry>();
  for (const entry of entries) {
    const slot = plan.get(entry.id);
    if (slot !== undefined) bySlot.set(slot, entry);
  }
  usedSlots = new Set(bySlot.keys());
  pendingSlotIndexes.forEach((index, slot) => {
    const base = baseRecords[index];
    const entry = bySlot.get(slot);
    records[index] = entry
      ? {
          ...base,
          title: entry.title.trim() || base.title,
          artist: localArtist(entry.artist),
          duration: Number.isFinite(entry.duration) ? entry.duration : base.duration,
          file: `local:${entry.id}`,
          pending: false,
          lyrics: null,
          localId: entry.id,
          coverUrl: entry.cover ? cachedLocalCoverUrl(entry.id) : undefined,
        }
      : { ...base };
  });
  for (const listener of listeners) listener();
}

/** 订阅曲库覆盖结果（阵列内容变化）；订阅时立即回调一次。 */
export function subscribeTracks(listener: () => void) {
  listeners.add(listener);
  listener();
  return () => {
    listeners.delete(listener);
  };
}

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
/** 时长为空（占位曲目）时返回 --:--，与终端排版一致。 */
export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
