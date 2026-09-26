# 本地曲库

> 2026-09-26 后续：设置面板里的迷你播放器已移除；本文中「迷你播放器显示…」的断言现改为直接读音频状态（`musicState()`）。
> 2026-09-23 后续：本地曲目已接入五列阵列（占位槽继承、删除回退、超限拒绝与启动竞态）。
> 本文中「不进入五列阵列」的表述仅描述当时那一轮；当前实现见 [LOCAL-ARRAY.md](LOCAL-ARRAY.md)。

2026-09-23。设置面板新增「LOCAL LIBRARY / 本地曲库」：用户导入自己的音频文件，持久保存、播放、编辑元数据、删除。本地曲目接进播放链路，但不进入五列阵列。

## 需求与范围

- 入口在设置面板，不新增顶层按钮；导入后进入播放列表（迷你播放器、详情走带、上一首／下一首、播放记录）。
- **不进入五列阵列**：`content/tracks.json` 的 40 槽几何、`scene.ts` / `track-atlas.ts` / `archive-loop.ts` 全部未改动。
- 元数据：文件名按「艺术家 - 曲名」解析（`-`、`–`、`—`；优先带空格的分隔符，其次任意位置的长破折号；没有分隔符时整名作标题、歌手留空并在界面显示 `UNKNOWN`）。时长由音频实际解码读取，不猜。标题与歌手都可以在面板里就地编辑。
- 持久化：文件本体（Blob）存 IndexedDB，不用 localStorage 存音频；刷新、重开与 PWA 更新后仍在。

## 数据层 `src/local-tracks.ts`

- 库 `rhine-local-tracks`、对象仓 `tracks`（`keyPath: "id"`，版本 1），记录 `{id, title, artist, duration, mime, size, addedAt, blob}`。`list()` 只返回不含 blob 的元数据，并按 `addedAt` 升序（同刻按 id），因此本地段顺序稳定，播放列表下标不会自己抖动。
- `add(file)`：空文件直接拒绝；先解析文件名，再用 `<audio>` 读元数据时长，失败时回落到 `decodeAudioData`；两者都失败就抛 `LocalTrackError`（"音频格式不受支持或文件已损坏"）。写入成功后再预热 object URL。
- `update(id, patch)`：空标题保留原值，歌手可以清空（界面显示 UNKNOWN）。
- `remove(id)`：先广播新列表、**1 秒后再回收 object URL**，让音频引擎有时间切走正在播放的这一条，避免中途断源报错。
- `objectUrl(id)` / `cachedLocalObjectUrl(id)`：object URL 缓存在模块内的 Map 里；`primeLocalObjectUrls()` 在重建播放列表前预热，使引擎可以同步取用；`pagehide`（非 bfcache）时统一 revoke。
- 变更通过 `window` 上的 `rhine-local-tracks` CustomEvent 广播；`subscribeLocalTracks()` 订阅时立即回调一次当前值。`refreshLocalTracks()` = 列表 + 预热 + 广播。
- 不可用检测：`localTracksSupported()` 先看 `indexedDB`，`openDb()` 对 open 抛错、`onerror`、`onblocked` 分别给出可读中文错误，全部以 `LocalTrackError` 抛出，界面直接显示 message。

## 播放链路 `src/audio.ts`

- `MusicTrack` 增加可选 `localId`。本地曲目的 `file` 是 `local:<id>`。
- `trackSource(file)`：`local:` 前缀走 `cachedLocalObjectUrl()`，其余完全维持原来的 `assetUrl("audio/…")` 行为；曲目切换时若本地音源尚未就绪（取不到 URL），不写空地址进 `<audio>`，只记 `error` 并跳过本次切换。
- 播放列表组成：`base`（内置三轨 + `audio/manifest.json` 追加）+ 本地段。`preparePlaylist()` 现在只更新 `base` 再 `rebuildPlaylist()`，因此本地段不会被 manifest 的异步结果冲掉，两种加载顺序都安全。
- `setLocalTracks(entries)`：本地段的内容签名（id + title + artist）未变化时只重建一次并广播；变化时重建列表并重映射（见下）。

## 索引重映射

`prefs.musicTrack`、`musicState().wanted` 与 `musicState().track` 都是播放列表下标，而本地曲目增删会让下标位移。

- 稳定标识 `musicTrackKey(file)`：本地曲目用 `local:<id>`，其余把 `.ogg` / `.mp3` 归一化后按文件名比较。内置轨 `atmosphere` 与曲库里的 `atmosphere.ogg` 因此落在同一个标识上。
- 本地曲目**永远追加在 base 之后**，所以导入、改名、删除都不会移动已入库曲目的下标——这是把重映射面缩到最小的关键。
- `setLocalTracks()` 在重建前后各取一次「正在播放」与「播放目标」的标识，重建后按下标反查：
  - 两个标识都还在 → 只更新下标，`<audio>` 元素不受影响，**播放不中断**；用户选择也不会被重置。
  - 播放目标被删掉但另有曲目在播 → 播放目标跟随当前曲目。
  - 正在播放的曲目被删掉 → 顺延（见下）。
- `main.ts` 的 `playlistIndex()` 从「按标题匹配」改为「按标识匹配」。标题可以手动编辑、也可能重名，按标题匹配在本地曲目存在时不再可靠；按文件名匹配对既有的 6 条已入库曲目结果不变。

## 删除正在播放的曲目

确定行为：**顺延到播放列表中原位置的下一条；如果删掉的是最后一条，则回绕到第一条；只有删除后播放列表为空时才回落到场景联动（`musicTrack = -1` + `stopPlayer`）。**

实现：删除后的下标按 `removedIndex % 新长度` 计算（`removedIndex` 是它在删除前列表里的位置），`activeTrack` 先置 -1 再 `startPlayer(target)`，避免沿用旧的曲目标识。音频设备未运行时只更新 `prefs.musicTrack`，等下一次 `activate()` 自动接上。

## 设置面板 UI

- `src/audio-settings.ts` 新增 `localLibraryMarkup(entries, ui)`（区块内容）与 `LocalLibraryUi`；`main.ts` 的 `settingsMarkup()` 输出 `<section id="local-library">` 外壳，`renderModal()` 打开设置时调用 `refreshLocalLibrary()` 填充。
- 区块：左侧 `LOCAL LIBRARY` + 中文说明，右侧隐藏的 `<input id="local-import" type="file" accept="audio/*" multiple>` 与 `＋ IMPORT / 导入` 按钮；下面是状态行（可用性／导入结果／错误，`role="status"`）与曲目列表；无曲目时给空态文案。
- 每行：等宽数字序号、标题、`歌手 · LOCAL`、等宽数字时长、播放／编辑／删除。播放按钮在正在播放时变成 `❚❚ 暂停`；编辑是行内两个输入 + 保存／取消；删除先进入确认行（确认删除／取消），不弹出新对话框。
- `main.ts` 接线：`change` 委托处理 `#local-import`（读完即清空 value，便于重复导入同一文件）；`click` 委托处理 `data-local-action`（沿用项目既有的 data-* 事件委托风格）；导入／编辑／删除后刷新面板与迷你播放器，并用 `notify()` 反馈。
- 播放状态只切换行的 `.playing` 类与按钮文案（`syncLocalPlaying()`），不重建 DOM——否则导入过程中打开的文件选择器会被替换掉。
- 迷你播放器的曲目按钮列表来自 `musicState().tracks`，本地曲目因此自动出现在那里；`.player-title` 显示 `本地曲名 · 歌手`。

## 样式与主题

- `src/style.css` 追加 `.local-library` / `.local-row` / `.local-edit` 等少量新类，颜色全部走 `--theme-*` 变量，因此亮暗两套主题自动成立，不需要在 `theme.css` 里加覆盖。
- 列表限高 208px 并滚动（`scrollbar-width: thin`），避免把设置面板撑得更长；`compact` / `portrait` 下改为不限高，按钮 44px、编辑输入 16px，行由四列折为两列。
- 详情面板新增一行 `#playback-local`，在播放本地曲目时显示 `LOCAL LIBRARY · 曲名 · 歌手`。
- 减少动态效果：按钮过渡取消；本地曲库本身不含位移动画，弹窗沿用既有 300ms / 200ms 规则。

## PWA 与用户数据

- `scripts/pwa-worker.js` 只操作 Cache Storage：`install` 失败时删掉自己这一版缓存，`activate` 时清理同前缀的旧版本，全文没有 `indexedDB` / `localStorage` 调用（已用脚本核对 `dist/sw.js`）。
- `src/pwa.ts`、`scripts/build-pwa.mjs` 也不清任何用户数据；`build-pwa.mjs` 只重写 `dist/sw.js` 与 `dist/pwa-build.json`。
- 所以「更新并重启」「缓存刷新」「重新部署」都只换资源，本地曲库（IndexedDB）不动；新版本的哈希 JS/CSS 会出现在新缓存版本里，见 `dist/sw.js`。

## 验证

`node scripts/check-local-imports.mjs`（puppeteer-core 驱动系统 Edge 无头；`CHECK_URL` 指定地址，`CHECK_OUT` 指定证据目录）。测试音频由脚本自己生成：两个合法 WAV（`Alpha Artist - First Song.wav` 用短横线、`Beta Artist – Second Song.wav` 用长破折号）+ 一个损坏的 `Broken Upload.mp3`，不依赖手工准备。

断言与实测结果（`verification/local-imports/local-imports-report.json`，`passed: true`）：

| 检查 | 实测 |
| --- | --- |
| 导入后出现在列表，解析歌手／曲名，读真实时长 | 行 1 `First Song` / `Alpha Artist · LOCAL` / `00:25`；行 2 `Second Song` / `Beta Artist · LOCAL` / `00:30` |
| 导入不打断当前播放 | 导入前后 `track` 都是 1（`motif`），`playing` 仍为 true |
| 刷新后仍在（IndexedDB），且不进入阵列 | 刷新后仍 2 行，播放列表含 2 条 `local:`；`selected` 全程 `RM-002` 不变 |
| 可开始播放 | 点击行内播放后 `track.file = local:<id>`、`playing = true`，行显示 `❚❚ 暂停`，迷你播放器显示 `First Song · Alpha Artist` |
| 编辑标题后列表与播放器同时更新 | 列表 `Renamed Local Song`、`.player-title` 同步；播放曲目标识不变，未重启 |
| 删除正在播放的曲目 | 先进入确认行；确认后剩 1 行，播放顺延到另一条本地曲目（`local:<第二条 id>`），阵列选择不变 |
| 删掉最后一条本地曲目 | 列表回到空态，无 `local:` 残留，播放回绕到播放列表首位（`atmosphere`） |
| 损坏／不支持的文件 | 不进入列表；状态行 `无法导入「Broken Upload.mp3」：音频格式不受支持或文件已损坏。` |
| 详情面板 | 播放本地曲目时 `#playback-local` 显示 `LOCAL LIBRARY · Renamed Local Song · Alpha Artist` |
| 页面报错 | 无 |

证据目录 `verification/local-imports/`：

- `check-01-imported.png` … `check-11-broken-file.png`：导入、两行、刷新后、播放、编辑、编辑后、详情、删除确认、删除后、空态、损坏文件，共 11 张。
- `layout-desktop-light.png` / `layout-desktop-dark.png` / `layout-portrait-light.png` / `layout-portrait-dark.png`：6 首曲目时桌面亮／暗与 390×844 竖屏亮／暗的区块排版。
- `layout-measurements.json`：同一批版式的实测几何。桌面 `.settings-modal` 948 高、内容 1864 高（本来就是可滚动面板，`max-height: 950px; overflow-y: auto`）；竖屏 350×816 内区块宽 308，行折为两列，`scrollWidth === clientWidth`，无横向溢出。
- `local-imports-report.json`：断言、逐步状态快照与失败列表。

其他回归：

- `npx tsc --noEmit` 通过；`npm run build` 通过（`✔ built` + `Offline release …: 819 files, 30.8 MiB`，退出码 0）。
- `node scripts/check-playback.mjs` 通过（选曲即播、详情内原地换选、播放器切歌跟随、抬起的卡片点击进入详情）。`playlistIndex()` 改成按标识匹配后，RM-001…RM-010 的映射结果与改动前一致。
- `npm run check:content` 18/18 通过。
- 同一份检查脚本对着 `npm run preview`（`dist` 生产构建，`CHECK_URL=http://127.0.0.1:4173`）再跑一遍也通过，说明哈希资源与生产构建路径不受影响。
- `node scripts/check-pwa.mjs` 在本机无法执行：脚本 `import('playwright')`，而仓库只装了 `puppeteer-core`（既有环境差异，与本轮改动无关）。PWA 与用户数据的安全性改为静态核对 + 上文产物检查代替。

## 已知限制

- **存储配额**：音频本体在 IndexedDB 里，配额由浏览器按源分配（常见为可用磁盘的一个比例）。写满时 `add()` 会抛出「存储空间可能已满」的可读错误，但不会提示还剩多少；没有做容量预估或清理策略。
- **不做 ID3 解析**：只读文件名与真实时长，不读 ID3v2 / Vorbis comment / MP4 atom。带 ID3 的 mp3 仍按文件名解析，需要更准确的信息就手动编辑。
- **仅本机有效**：数据不跟随账号同步，浏览器配置文件被清理或换设备后不可恢复；也没有导出／导入能力。
- **重复导入不查重**：同一个文件导入两次会得到两条记录（各自独立的 id）。
- **格式支持取决于浏览器解码器**：脚本只用 WAV 验证过；mp3 / m4a / flac / ogg 按浏览器实际支持情况而定，不支持就会看到「格式不受支持或文件已损坏」。
- **壁纸构建**：`npm run build:wallpaper` 里设置面板只在「工作台」模式下打开，本地曲库照旧可用（IndexedDB 与 PWA 同源），但没有专门验证；壁纸宿主每次加载会重新读 WE 属性，本地曲库不受影响。
- **壁纸宿主属性覆盖**：`prefs.musicTrack` 在被 `apply()` 用 WE 属性重写声音／音乐开关时可能被 `configureAudio()` 重新计算，极端情况下会退回场景联动；未在真实 Wallpaper Engine 里验证。
- **详情面板不显示本地曲目的元数据页**：本地曲目不进曲库数组，因此没有自己的详情页；详情面板只在其走带下方标注正在播放的本地曲目。若要给本地曲目单独的详情页，需要另开一条不依赖阵列的渲染路径。
