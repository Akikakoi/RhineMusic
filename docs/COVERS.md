# 内嵌专辑封面

状态：已完成（v1，2026-09-26）。本文是「选中卡片正面显示专辑封面」的唯一开发记录：需求、方案、验证与遗留都在这里维护。

## 1. 需求与范围（2026-09-26 确认）

- 导入本地音频时，从**文件内嵌元数据**提取专辑封面；不联网、不手动选图、不用侧车图片文件。
- 封面印在**当前选中卡片正面的右半部分**；左半部分继续放编号、分类与曲目信息。
- 右半区：封面**铺满右半区**（按长边取较大缩放，超出的左右部分裁掉），不留上下留边。
- 去掉原先的标志水印。
- 左半文字放不下时缩小并加省略号。
- 站点自带曲目（`public/audio`）**不**提取封面。
- 已经导入过的旧曲目没有封面字段就留空，不做回溯重扫。
- 范围外：详情面板、其余 39 张阵列卡片、壁纸媒体卡都不显示封面；不做在线抓取与手动选图。

## 2. 数据层

`src/local-tracks.ts`

- 解析器（零依赖手写，与 `scripts/generate-audio-manifest.mjs` 的 mp3 时长解析同一风格）：
  - mp3：ID3v2 `APIC`（v2.3/v2.4）与 `PIC`（v2.2），帧大小按 v2.3 普通整数 / v2.4 同步安全整数区分；跳过扩展头。
  - mp4/m4a：`ftyp` 容器 → `moov`→`udta`→`meta`→`ilst`→`covr`→`data`，图片类型按 `data` 盒 version 低字节（13=JPEG、14=PNG）。
  - flac：`fLaC` 元数据块 type 6（`PICTURE`），读 MIME、描述与图片长度。
  - 其余格式、解析失败、图片类型不受支持或原图超过 8 MB 一律返回 `null`。
- 提取时机：`addLocalTrack()` 与读真实时长同一趟；解析失败**不阻断导入**，这首只是没有封面。
- 存储：`coverBlob` 随记录写进 IndexedDB（`rhine-local-tracks` / `tracks`）；`LocalTrackEntry.cover: boolean` 表示有没有封面，列表接口仍然不返回 blob。
- object URL：封面与音频分开管理（`coverObjectUrls`）。`primeLocalObjectUrls()` 改成每条记录只读一次，音频与封面各建一个 object URL；删除曲目、`pagehide` 统一 `revoke`。

`src/data.ts`

- `TrackRecord` 增 `coverUrl?: string`。
- `applyLocalTracks()` 覆盖占位槽时写入 `coverUrl: entry.cover ? cachedLocalCoverUrl(entry.id) : undefined`；取消覆盖或没有封面时字段缺省。

## 3. 渲染层（`src/scene.ts`）

- `drawLabel(index)` 改为左右两半：`half = 画布宽 / 2`。
  - 左半（x ≈ 24…488）：`RHINE MUSIC` / `AUDIO ARCHIVE`、`NO.0xx`、分类、金色分隔线、曲名（46px、最多两行、超出省略号）、歌手（28px、省略号）、时长（左下）、状态（左下右对齐）。
  - 右半：`drawLabelCover()`。
- `drawLabelCover()`：封面铺满右半区——按长边取较大缩放（cover），用 `clip()` 裁掉超出部分，**不留上下留边**；方图会左右各裁掉一点。没有封面时右半保持纸面留空。
- 异步加载：按 object URL 缓存 `Image`；未解码完成时右半先留空，`onload` 后只在「印刷面仍是同一张封面」时重画一次，避免覆盖别张卡片的标签。
- 去掉 `labelMark` 水印及其在 `load()` 里的 `decode()`；`brand.labelMarkSvg` 不再被引用（导出保留，其他品牌元素照旧）。
- `getStats()` 增 `label: { index, cover: "none" | "loading" | "ready" }`，供检查脚本读取。
- 编号与分类从原来的右上角移到左半顶部；水印删除。

## 4. 验证

`scripts/check-covers.mjs`（`npm run check:covers`）。测试文件由脚本自己生成：

- `Cover Artist - Cover Song.mp3`：脚本自造的 ID3v2.3 标签（含 PNG `APIC`）+ 仓库里真实 mp3 去掉原 ID3 后的音频帧，保证浏览器能解码。
- `Plain Artist - No Cover Song.wav`：普通 WAV，没有封面字段。

断言与截图见 [verification/COVERS.md](../verification/COVERS.md)。

## 5. 已知限制

- 只解析内嵌封面；外部图片文件与在线抓取不在范围内。
- 封面原图直接入库，未做压缩或缩略；单张超过 8 MB 视为没有封面。导入时会把整个音频文件读进内存一次。
- ogg / opus / wav 没有通用的内嵌封面字段，一律留空；Vorbis comment 的 `METADATA_BLOCK_PICTURE`（base64）未实现。
- 站点自带曲目（`public/audio`）即使文件里有内嵌封面也不显示。
- 已经导入过、当时没有记录封面的曲目不会自动补：要看到封面得删除后重新导入。
- 详情态下卡片右半区会被右侧详情面板遮住，封面在选卡、抽取过程与阵列视图里更容易看到。

## 6. 进度记录

### 2026-09-26 · v1 完成

- 需求确认：站点曲目不提取、右半区铺满封面（无上下留边）、去掉水印、左半文字加省略号、旧曲目留空（见 §1）。
- 代码：`src/local-tracks.ts`（解析 + 存储 + object URL）、`src/data.ts`（`coverUrl`）、`src/scene.ts`（左右分栏 + 封面绘制 + 去水印 + `getStats.label`）、`src/main.ts`（`stats().library` 暴露 `cover`）。
- 验证：`npm run check:covers` 通过（6/6）；`npx tsc --noEmit` 与 `npm run build` 通过。
- 证据：`verification/covers/`（7 张截图 + `covers-report.json`），记录见 [verification/COVERS.md](../verification/COVERS.md)。
