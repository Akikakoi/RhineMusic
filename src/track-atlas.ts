import { records } from "./data";

// 曲名图集：40 条曲名画进一张 2048 × 800 的贴图（4 列 × 10 行，每格 512 × 80）。
// 阵列里所有卡片共用同一份几何与材质，靠每个实例的 UV 偏移取到自己那一格，
// 因此 40 个曲名只需要一张纹理，而不是每张卡片一张。
//
// 字号直接按屏幕观感定：索引签浮在卡片顶上方约 1.1（见 scene.ts TAB_HEIGHT），
// 屏幕上整格投影接近各向同性，不需要再对深度做预拉伸（试过 3.4 倍反而把
// 字形裁碎）。字号占格高约六成，落回屏幕约 14–18px。
export const ATLAS_COLUMNS = 4;
export const ATLAS_ROWS = 10;
export const ATLAS_CELL_WIDTH = 512;
export const ATLAS_CELL_HEIGHT = 200;
export const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_CELL_WIDTH;
export const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_CELL_HEIGHT;

// 纸色刻意比卡片顶面深一档：太接近白色时，标签在景深模糊里会像透明塑料片。
const PAPER = "#cfc8b6";
const INK = "#171713";

/** 把文字压到指定宽度内：先缩字号，仍放不下再截断加省略号。 */
function fitText(c: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let size = 92;
  c.font = `500 ${size}px MiSans, Arial, sans-serif`;
  while (size > 40 && c.measureText(text).width > maxWidth) {
    size -= 1;
    c.font = `500 ${size}px MiSans, Arial, sans-serif`;
  }
  if (c.measureText(text).width <= maxWidth) return { text, size };
  let trimmed = text;
  while (trimmed.length > 1 && c.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return { text: `${trimmed}…`, size };
}

export function drawTrackAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const c = canvas.getContext("2d")!;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  c.textBaseline = "middle";
  records.forEach((track, index) => {
    const col = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    const x = col * ATLAS_CELL_WIDTH;
    const y = row * ATLAS_CELL_HEIGHT;
    // 每格四周一圈细线，让相邻标签在阵列里像一张张索引卡
    c.strokeStyle = "rgba(23,23,19,.5)";
    c.lineWidth = 4;
    c.strokeRect(x + 6, y + 6, ATLAS_CELL_WIDTH - 12, ATLAS_CELL_HEIGHT - 12);
    const { text, size } = fitText(c, track.title, ATLAS_CELL_WIDTH - 60);
    c.fillStyle = track.pending ? "#6b6558" : INK;
    c.font = `500 ${size}px MiSans, Arial, sans-serif`;
    c.fillText(text, x + 30, y + ATLAS_CELL_HEIGHT / 2 - 4);
  });
  return canvas;
}

/** 某条曲目在图集里的左上角 UV（shader 里 uv * 格尺寸 + 该偏移）。 */
export function trackUv(index: number) {
  const safe = ((index % records.length) + records.length) % records.length;
  const col = safe % ATLAS_COLUMNS;
  const row = Math.floor(safe / ATLAS_COLUMNS);
  return { u: col / ATLAS_COLUMNS, v: 1 - (row + 1) / ATLAS_ROWS };
}
