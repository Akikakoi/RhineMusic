# 播放列表

状态：已完成（阶段 1+2，2026-09-26）。本文是「命名播放列表 + 播放队列」的唯一开发记录：需求、方案、验证与遗留都在这里维护。

## 1. 需求与范围

- 用户可创建**命名播放列表**，并用它作为当前播放来源；播放列表即播放队列。
- **移除「收藏 / SAVED」功能**（用户确认「彻底移除收藏」，曲目收录完全由播放列表承担）。
- 范围内：新建（**自动填入曲库里的全部曲目**，再按需删减）、重命名、删除列表；从曲目详情加入曲目；列表内播放单曲、移除、上移、下移；整条播放；失效项标注与跳过；`localStorage` 持久化。
- 范围外：跨设备同步；导入/导出（m3u8 或文本，属阶段 3）；播放队列本身不持久化——刷新后回到整个曲库，列表内容仍在。

## 2. 播放引擎（`src/audio.ts`）

- 新增 `queueKeys: string[] | null`：null = 整个曲库（内置三轨 + `manifest.json` 扩展 + 本地段），否则是按 `musicTrackKey` 排列的来源。
- `rebuildPlaylist()`：有队列时按标识从曲库里解析出曲目，**曲库里已不存在的条目自动跳过**、重复标识去重，不需要外部先分析失效项；没有队列时就是整个曲库。
- `setQueue(keys | null)`：切换来源。正在播放的曲目仍在新来源里时只更新下标、**不重启 `<audio>`**；否则退到新来源的第一条；来源为空时回到场景联动。
- `musicState()` 增 `queued: boolean`，所有 UI（详情走带、`#playback-local`）继续只读 `musicState()`，因此自动跟随队列。

## 3. 数据层（`src/playlists.ts`）

- 存储键 `rhine-playlists`（与 `rhine-settings` 同一套约定），结构 `{ id, name, createdAt, tracks: string[] }[]`。
- `tracks` 存 **`musicTrackKey`**：站点曲目按文件名（`.ogg`/`.mp3` 归一化），本地导入曲目按 `local:<id>`。比存 `RM-0xx` 槽位编号准确——槽位内容会随本地曲库换歌。
- 上限：24 个列表、每个 200 首、名称 24 字；读取时清洗（丢弃非法项、去重、截断）。
- 导出：`listPlaylists` / `getPlaylist` / `subscribePlaylists` / `createPlaylist(name, tracks?)` / `renamePlaylist` / `removePlaylist` / `addToPlaylist` / `removeFromPlaylist` / `moveInPlaylist`；变更经 `rhine-playlists` CustomEvent 广播。
- 新建时的初值由调用方给出：`main.ts` 传 `audio.libraryKeys()`（整个曲库的标识），所以新列表一次填满，用户只做删减。

## 4. 界面（`src/main.ts`、`src/style.css`、`src/responsive.css`）

- 顶部导航新增 `＋ PLAYLISTS`（显示列表数量；队列激活时高亮），替换原 `＋ SAVED`。
- `audio.ts` 另加 `libraryKeys()`：返回整个曲库（内置三轨 + manifest 扩展 + 本地段）的标识，供新建列表填满。
- 播放列表弹窗：左列是列表（新建 / 选择，正在播放的标色），右列是标题（`▶ 播放`、`重命名`、`删除`，删除走二段确认）与曲目行（`▶` / `↑` / `↓` / `移除`，边界按钮置灰）。
- 详情面板：`＋ ADD TO PLAYLIST` 打开弹窗进入「加入模式」，点哪个列表就加进哪个；队列激活时详情面板显示 `PLAYLIST <名称>` 与 `退出列表`。
- 播放队列外的曲目：`ensureQueueFor()` 先退出队列回到整库再取下标，避免「曲目不在队列里」被误判为未入库。
- 列表内容变化（加入/移除/排序）后 `syncPlaylistQueue()` 立即把新顺序交给引擎；列表被删则退出队列。
- 移除收藏的触点：导航按钮、SAVED 弹窗分支、`data-action="bookmark"`、`rhine-saved` 读写、`renderResults` 的收藏过滤与标记、`stats().saved`、详情面板收藏按钮；`responsive.css` 里的 `[data-action="saved"]` 规则改为 `playlists`。旧的 `rhine-saved` 键不再被读取（留在浏览器里无害）。

## 5. 验证

`scripts/check-playlists.mjs`（`npm run check:playlists`），11 项断言 + 7 张截图，见 [verification/PLAYLISTS.md](../verification/PLAYLISTS.md)。

## 6. 已知限制

- 播放队列不持久化：刷新后回到整个曲库（列表内容持久化，队列是会话状态）。
- 队列只有一个来源；不支持「插播到队首」这类队列编辑。
- 列表只存标识，本地导入曲目的音频本体在本机 IndexedDB，换设备或清站点数据后这些条目标为「已失效」。
- 曲目列表里已失效的条目可以移除，但不会自动清理；引擎侧始终跳过。

## 7. 进度记录

### 2026-09-26 · 阶段 1+2 完成（含移除收藏）

- 需求确认：按阶段 1+2 实现；不要收藏功能，且确认**彻底移除**收藏。
- 引擎：`audio.ts` 加 `queueKeys` / `setQueue()` / `musicState().queued` / `libraryKeys()`。
- 数据层：新增 `src/playlists.ts`。
- 界面：`main.ts` 新增播放列表弹窗、加入列表、队列指示与退出；删除全部收藏相关代码；`style.css` 新增 `.playlist-*` / `.playback-queue` 样式；`responsive.css` 窄屏单列与 44px 控件。
- 旧脚本同步：`check-font-update` / `check-pwa-recovery` / `check-pwa` 改用 `rhine-playlists` 作为「用户数据不丢」的探针；`check-responsive` 的收藏步骤改为播放列表。
- 验证：`npm run check:playlists` 11/11 通过；`check-covers`、`check-local-imports` 回归通过；`npx tsc --noEmit`、`npm run build` 通过。

### 2026-09-26 · 新建列表自动填入曲库

- 需求：播放列表自动填充所有的歌曲。
- 实现：`createPlaylist(name, tracks)` 接受初值；`main.ts` 新建时传 `audio.libraryKeys()`，toast 提示已填入多少首；空态文案改为「新建一个会自动填入曲库里的全部曲目」。
- 验证：`check:playlists` 重写后仍 11/11（新增「新建即填满、顺序与曲库一致」断言，以及「移除后从详情加回」流程）。
