# 音乐播放器（迷你播放器）开发文档

状态：进行中。本文档是音乐播放器功能的唯一开发记录：方案、阶段任务、验证方式与逐阶段进度都在这里维护。每完成一个阶段，就在文末「进度记录」追加一节（做了什么、改了哪些文件、遗留事项），方便后续会话接着做。

## 1. 目标与范围

把设置弹窗中的「BACKGROUND MUSIC 观测室 · 背景音乐」从单纯开关升级为迷你播放器：

- 内置三轨（atmosphere / motif / pulse）成为可选曲目：观测室·氛围、主题动机、脉冲。
- 支持 `public/audio/manifest.json` 声明扩展曲目，启动时自动并入播放列表；manifest 缺失或损坏时只用内置三轨。
- 场景联动（现有三轨按场景变轨的混合模式）保留为默认模式；手动选曲后联动暂停，可一键回到联动。
- 播放器控件：播放/暂停、上一首/下一首、循环模式（单曲/列表）、进度条与时间显示，样式沿用磨砂玻璃规范。
- 偏好（曲目、循环模式、开关、音量）持久化到现有 `rhine-settings` 存储，老偏好不丢。

不在本次范围：整站改播放器界面、Wallpaper Engine 分支的独立控件、音效系统改动、开场时间码改动、三轨源文件与谱面脚本改动。

## 2. 改前 / 改后对照

| 项目 | 改前 | 改后 |
| --- | --- | --- |
| 曲目概念 | 无，三轨同时循环、按场景变比例 | 曲目列表：场景联动 + 内置三轨 + manifest 扩展曲目 |
| 播控 | 仅开关 + 音量 | 开关 + 音量 + 播放/暂停 + 切曲 + 循环模式 + 进度 |
| 引擎 | 仅 AudioBufferSourceNode 循环（不可暂停/seek） | 联动模式沿用原引擎；选曲模式走 HTMLAudioElement（可暂停/seek），经 musicBus 混入原音频图 |
| 偏好 | sound/music/音量 | 新增 musicTrack（-1=联动）、musicLoop（one/all） |

## 3. 架构设计

### 3.1 播放引擎（src/audio.ts）

- `MusicTrack = { file: string; title: string; subtitle: string }`；内置 `BUILTIN_TRACKS` 三条，`loadPlaylist()` fetch `audio/manifest.json` 合并扩展曲目（失败静默回退内置）。
- `AudioPreferences` 扩展：`musicTrack: number`（-1 表示场景联动）、`musicLoop: "one" | "all"`。
- 联动模式：现有三 stem 引擎完全不动（stemGains、mixScene、boot 混音）。
- 选曲模式：`HTMLAudioElement` + `createMediaElementSource` → `playerGain` → `musicBus`，复用现有音量、duck、淡入淡出链路；元素懒创建、跨模式复用。
- 切曲交叉过渡：`playerGain` 约 0.35s 淡出 → 换 src → 淡入；联动↔选曲切换同样淡接，联动机 `startMusic` 既有 1.2s 音乐总线爬升保持不变。
- 循环：`musicLoop === "one"` 时 `element.loop = true`；`"all"` 时 onended 自动下一曲（只在真实曲目间轮转，不含联动）。
- 状态输出：`musicState()` 返回快照（列表、当前索引、播放状态、进度、时长、循环模式）；状态变化与 `timeupdate` 通过 `window` CustomEvent `rhine-music-state` 广播给 UI。
- 可见性/宿主暂停：`hide()` 时同时暂停播放器元素；`activate()` 恢复时按当前模式恢复 stems 或播放器。

### 3.2 曲目清单（public/audio/manifest.json + scripts）

- 格式：`{ "tracks": [{ "file": "xxx", "title": "...", "subtitle": "..." }] }`，`file` 对应 `public/audio/<file>.ogg`（不带扩展名）。
- `scripts/generate-audio-manifest.mjs`：扫描 `public/audio/*.ogg`，排除内置三轨，生成/更新 manifest；`npm run audio-manifest` 触发，不挂进既有构建链。

### 3.3 设置 UI（src/audio-settings.ts + style.css / responsive.css）

音乐区块内追加播放器面板：

- 模式行：`场景联动` 按钮 + 各曲目按钮（active 高亮当前）。
- 走带行：上一首 ⏮ / 播放暂停 ▶·⏸ / 下一首 ⏭ / 循环模式 ↻ ONE·ALL；联动模式下走带按钮置灰（播放暂停即总开关）。
- 进度行：range 进度条（0–1000 归一化，拖动 seek）+ `mm:ss` 时间；联动模式下隐藏。
- 曲名超宽时 CSS 横向滚动，`.reduce-motion` 下禁用动画直接显示。
- 事件接线走 main.ts 现有全局委托：`data-music-mode` / `data-music-track` / `data-music-action` / `data-music-seek`。

### 3.4 偏好与联动（src/main.ts）

- `storedPrefs` 类型与 `prefs` 默认值补充 `musicTrack: -1`、`musicLoop: "all"`；`saveAudioPrefs()` 原样持久化。
- `configureAudio()` 透传新字段；监听 `rhine-music-state` 更新面板（播放图标、active、进度、时间），拖动进度条期间不回写滑块位置。
- StartupGate、音量滑杆、壁纸路径（设置不持久化但本次会话生效）行为不变。

## 4. 验证方式

- `npm run typecheck`（如无则 `npx tsc --noEmit`）与 `npm run build` 通过。
- 手动检查清单：联动模式行为与改前一致；选曲淡入淡出无爆音；单曲/列表循环正确；进度拖动 seek；音乐开关关闭再打开恢复当前曲目；刷新后曲目与循环模式保留；reduce-motion 无滚动动画；壁纸构建可编译（行为待实机）。

## 5. 阶段任务清单

- [x] 阶段 1：创建本开发文档（方案 + 阶段清单 + 进度记录区）。
- [x] 阶段 2：audio.ts 播放引擎曲目化与迷你播放器核心。
- [x] 阶段 3：扩展曲目 manifest 机制与生成脚本。
- [x] 阶段 4：设置弹窗播放器 UI（audio-settings + CSS）。
- [x] 阶段 5：main.ts 偏好持久化与状态联动。
- [x] 阶段 6：类型检查与构建验证、文档收尾。

## 6. 进度记录

> 每完成一个阶段在此追加：日期、完成内容、涉及文件、遗留事项。

### 2026-09-19 · 阶段 1 · 创建开发文档

- 建立 docs/MUSIC-PLAYER.md：固化已确认方案（方向 A：设置弹窗内迷你播放器；曲目来源内置+扩展目录）、架构设计、验证清单与阶段任务。
- 尚未改动任何源码；后续阶段完成时在此追加记录。

### 2026-09-19 · 阶段 2 · 播放引擎曲目化与迷你播放器核心（已完成）

- `AudioPreferences` 扩展 `musicTrack`（-1=场景联动）与 `musicLoop`（one/all），默认值保持改前行为（联动）。
- 新增 `MusicTrack` 类型与 `BUILTIN_TRACKS`（atmosphere=观测室·氛围 / motif=主题动机 / pulse=脉冲）。
- 新增选曲播放器：`HTMLAudioElement` + `createMediaElementSource` → `playerGain` → `musicBus`，懒创建、跨模式复用；切曲先 0.25s 淡出再换源淡入，无爆音。
- 新增公共 API：`preparePlaylist()`、`seek()`、`setPaused()`、`skip(dir)`、`setLoop()`、`musicState()`；状态经 `rhine-music-state` CustomEvent 广播（timeupdate 约 4Hz）。
- 场景联动三 stem 引擎未动（stemGains/mixScene/boot 混音原样）；`startMusic` 增加播放器模式守卫；联动↔选曲经 `switchMode` 淡接，`startMusic` 原有 1.2s 总线爬升保留。
- `hide()`（页隐藏/宿主暂停）同时暂停播放器元素并保留进度；`activate()` 恢复时按当前模式续播；`dispose()` 清理元素与监听。
- 循环：one=element.loop；all=ended 自动 `skip(1)`，只在真实曲目间轮转。
- 涉及文件：src/audio.ts。
- 遗留：tsc 报 main.ts 三处 `AudioPreferences` 缺新字段——属阶段 5 接线内容，阶段 5 完成后复查。

### 2026-09-19 · 阶段 3 · 扩展曲目 manifest 机制与生成脚本（已完成）

- 新增 public/audio/manifest.json（格式 `{ "tracks": [{ file, title, subtitle }] }`，file 不带扩展名），当前为空列表（目录内只有内置三轨）。
- 新增 scripts/generate-audio-manifest.mjs：扫描 public/audio/*.ogg，排除三轨内置 stem，生成 manifest；保留已有 title/subtitle 元数据，缺失项以文件名兜底；manifest 损坏时重建为空。运行方式 `npm run audio-manifest`（已加入 package.json，不挂进既有构建链）。
- 引擎侧合并逻辑已在阶段 2 的 `preparePlaylist()` 实现：manifest 缺失/损坏/超限（>32 条）时静默回退内置三轨。
- 验证：脚本实际运行通过，输出与预期一致（0 条扩展曲目）。
- 涉及文件：public/audio/manifest.json（新增）、scripts/generate-audio-manifest.mjs（新增）、package.json（加 script）。

### 2026-09-19 · 阶段 4 · 设置弹窗播放器 UI（已完成，待阶段 5 接线后联调）

- audio-settings.ts 重写：音乐区块追加 `.music-player` 面板——SCENE LINK 场景联动按钮 + 曲目按钮组（title/subtitle，manifest 内容经 escapeHtml 转义）、走带按钮（⏮ / ▶⏸ / ⏭ / ↻ ONE·ALL）、当前曲名与 mm:ss 时间、0–1000 归一化进度条；联动模式下走带置灰、进度隐藏、时间显示 --:--。
- audio.ts 新增导出 `MusicState` 类型（musicState 返回值），audioSettingsMarkup 第二参数接收播放状态。
- style.css：新增磨砂玻璃播放器样式（--theme-* 变量适配双主题、backdrop-filter、accent 复用 #565c46/#a67d48 既有模式）；进度条用 `.settings-list .player-progress` 前缀压过通用 label/input 规则（通用规则在其后定义，不用前缀会被覆盖）；`.reduce-motion` 下禁用过渡。曲名用 ellipsis 截断（设置弹窗每次重渲染，滚动实现收益低，且 reduce-motion 要求直接显示）。
- responsive.css 已有单列布局规则自动覆盖面板，无需改动。
- 涉及文件：src/audio-settings.ts（重写）、src/audio.ts（+1 类型导出）、src/style.css。
- 遗留：面板数据源与事件接线在阶段 5；reduce-motion 曲名滚动方案改为 ellipsis（见上），如需恢复滚动待用户反馈。

### 2026-09-19 · 阶段 5 · main.ts 偏好持久化与状态联动（已完成）

- prefs：新增 `musicTrack`（默认 -1=联动）、`musicLoop`（默认 all），从 rhine-settings 读取并归一化（放在 `...storedPrefs` 之后，避免 string 类型脏值覆盖）；saveAudioPrefs 原样持久化，老偏好自动获得默认值。
- 启动时 `audio.preparePlaylist()` 拉取 manifest（失败静默）；`settingsMarkup()` 传入 `audio.musicState()` 渲染面板。
- 事件接线：点击委托处理 `data-music-mode`（联动）/`data-music-track`（选曲）/`data-music-action`（toggle/prev/next/loop），位于通用按钮处理之前并提前 return，避免误触其他 dataset 逻辑；`data-music-seek` 走 input 事件 seek。
- 状态刷新：`rhine-music-state` 监听 → `updateMusicPanel()` 同步 active 高亮、禁用态、播放图标、循环标签、曲名、时间、进度；`skip()` 自动切曲（列表循环）时回写 `prefs.musicTrack` 并持久化；拖动进度期间（pointerdown→pointerup）不回写滑块位置防抖动。
- wallpaper/review 路径：`playBootPreview` 的 configure 调用经展开自动带上新字段，无需特判。
- 涉及文件：src/main.ts。
- 验证：tsc --noEmit 通过；npm run build 全量通过（vite 7.3.6，52.8s，离线发行包 818 文件/33.8 MiB 正常生成）。

### 2026-09-19 · 阶段 6 · 验证与提交收尾（已完成）

- 验证结果：tsc --noEmit 零错误；npm run build（tsc + vite build + PWA）通过，产物正常。
- 本地提交：14b8a44 `feat 音乐播放器：背景音乐升级为设置弹窗迷你播放器，曲目化引擎与扩展曲目 manifest`，仅含本任务 8 个文件（+597/-6）；工作区其他既有改动（archives、verification、wallpaper、vite.config 换行差异等）保持原状未混入。按用户要求**未推送远端**。
- 提交后修正：首次提交时编辑工具把 4 个源文件整体转成了 CRLF（仓库历史为 LF），diff 全文件膨胀；已校验内容除换行符外完全一致后统一转回 LF 并 amend，最终 diff 聚焦实际改动。commit message 为正确 UTF-8。
- 待办/后续：
  - 实际 UI 与听感待用户在浏览器验收（切曲淡接、循环模式、进度 seek、联动切换、刷新后偏好保留）。
  - Wallpaper 构建未单独跑全量（tsc 已过）；实机 WE 行为待测。
  - 加新曲目：把 .ogg / .mp3 放入 public/audio 后运行 `npm run audio-manifest`，重启即生效。
  - 如需曲名滚动动画替代当前 ellipsis 截断，另行迭代（见阶段 4 备注）。

### 2026-09-26 · 后续 · 移除设置面板里的迷你播放器

- 需求：删除设置页面的歌曲列表与播放界面（设置不再承担播放职能）。
- `src/audio-settings.ts`：`audioSettingsMarkup(prefs)` 只留音效/音乐开关与音量；去掉 `MusicState` 参数与整个 `.music-player` 标记。
- `src/main.ts`：删除 `updateMusicPanel()`（以及 12 处调用）与 `data-music-mode / data-music-track / data-music-action` 点击分支、`data-music-seek` 拖动分支；改为 `syncMusicPrefs()`——在 `rhine-music-state` 事件里把 `prefs.musicTrack` 同步回引擎目标，防止之后的 `saveAudioPrefs()` 把音频拉回旧曲目。
- `src/style.css`：删除 `.music-player` / `.player-modes` / `.player-mode` / `.player-transport` / `.player-now` / `.player-title` / `.player-time` / `.player-progress` 与对应的 reduce-motion 规则。
- 影响：播放选择与走带只在详情面板（NOW PLAYING）、本机曲库行和播放列表里提供；`scripts/check-local-imports.mjs` 的「迷你播放器标题」断言改为直接读 `musicState()`。

### 2026-09-20 · 追加 · 扩展曲目支持 mp3（已完成）

- 请求：用户询问是否支持 mp3。原实现曲目源写死 `.ogg` 后缀，不支持。
- 引擎（src/audio.ts）：新增 `normalizeTrackFile` / `trackSource`——manifest 的 `file` 字段不带扩展名时默认按 .ogg 播放（向后兼容旧格式），带扩展名（如 .mp3）时原样使用；去重过滤按去扩展名后的基名与内置三轨比对。
- 脚本（scripts/generate-audio-manifest.mjs）：同时扫描 .ogg 与 .mp3；.ogg 条目仍去扩展名存储，其他格式保留扩展名；标题兜底用去扩展名基名。
- 目录内已有的 observatory-preview.mp3（音频设计预览文件，本身已入 Git）现在会被扫描进播放列表；用户于 2026-09-20 确认希望预览文件保留在播放列表中，无需排除规则。
- manifest.json 的工作区改动（含个人 mp3 条目）暂不入库：两首个人音乐文件未提交，若清单入库，其他克隆环境会出现点选播放失败的死条目；待用户决定个人曲目的入库策略后再定。
- 验证：tsc --noEmit 通过；脚本重跑成功并生成 observatory-preview.mp3 条目。
- 本地提交（未推送远端，沿用既有约定）：`feat 音乐播放器：扩展曲目支持 mp3 格式`。
