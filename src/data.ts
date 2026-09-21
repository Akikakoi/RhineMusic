import content from "../content/tracks.json" with { type: "json" };

// RhineMusic：阵列内容源已从档案记录换为曲库。函数名沿用 data.ts 的既有约定，
// 使 archive-loop.ts、scene.ts 的阵列与槽位逻辑无需改动。
// 曲目分两类：已入库（duration/file 有值，可播放）与占位（pending，用于撑满五列各八份）。
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
}

export const records: TrackRecord[] = content.tracks;
export const categories = ["全部曲目", ...content.columns];
export const archiveColumns = content.columns;

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
