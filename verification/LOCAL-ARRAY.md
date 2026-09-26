# 本地曲目接入五列阵列

2026-09-23。上一轮（`07a83ab`）把本地曲库接进播放链路但刻意不进阵列；本轮把导入的曲目真正接入主界面的波浪阵列：每一首占一个方块，落在原占位槽上。仍不 commit / push。

## 用户决策（2026-09-23 确认，实现按此执行）

1. 卡面**不显示**导入歌曲的曲名：维持 `scene.setTrackLabels(false)`，不为本地曲目开标签，也不改 `track-atlas.ts` 的烘焙图集。
2. 导入顺序依次填**第一个空占位槽**（34 个 pending 槽，按 `records` 顺序，即 `tracks.json` 里的先后）。
3. 占位槽用完后导入**禁止**并给出可读提示，不写入 IndexedDB、不占位。
4. 删除导入的歌：该槽位**回到占位**（PENDING、不可播）；阵列当前选择不回退、循环不断。

## 曲库层：从静态常量变成运行时可更新

`src/data.ts` 之前是 `import content from "../content/tracks.json"` 的静态常量。现在：

- `baseRecords` 是 JSON 的原始内容，运行时不改写，仍是 40 槽、每列 8 份、稳定编号 `RM-001…RM-040` 的唯一来源。
- `records` 仍是导出给所有调用方的数组，**长度与顺序永远不变**，只有被本地曲目覆盖的占位槽会就地替换元素（`records[index] = {...}`）。因此 `columnFiles` / `fileLocation` / `fileAtSlot` / `archiveColumns` / `categories` 的签名与语义一律不动，`scene.ts`、`archive-loop.ts`、`track-atlas.ts` 的槽位几何与 UV 映射无需改动。
- 新增 `applyLocalTracks(entries)`：按占位槽序号覆盖元素；传空列表（删除全部、曲库不可用）时全部回到 `tracks.json` 的原始占位数据。
- 新增 `subscribeTracks(listener)`：订阅覆盖结果，订阅时立即回调一次（与 `subscribeLocalTracks` 同风格）。
- 新增 `localSlotCapacity`（= 34）、`localSlotState()`（`{capacity, used, remaining}`）、`nextLocalSlot()`（下一个空槽序号，用尽返回 `null`）。
- `TrackRecord` 增加可选 `localId`，本地填充的槽位才有值。
- 构建前的静态校验不受影响：`check-content.mjs` 校验的是 `content/archives.json` 与下载产物，`tracks.json` 未被改动，`npm run check:content` 仍是 18/18。

## 槽位继承与映射规则

- 本地曲目填入 pending 槽时，**槽位本身沿用原占位曲目**：`id`（RM-0xx）、`category`（列归属）、行坐标都不变，只替换 `title`、`artist`、`duration`、`file`、`pending`（→ false）。因此同一首歌总落在固定方块上，阵列几何、列归属、`fileTicks` 刻度数量都不动。
- `file` 写成 `local:<id>`（与上一轮的 `audio.ts` 约定一致），`duration` 用解码得到的真实时长，于是 `main.ts` 的 `playlistIndex()`（按 `musicTrackKey` 稳定标识匹配）直接命中播放列表里的那一条：详情走带、迷你播放器、上一首／下一首、播放记录、`#playback-local` 标注全部复用，没有第二套链路。
- **槽位随条目持久保存**：`LocalTrackEntry` 增加 `slot`（占位槽序号，0 = 第一个空槽），导入时由 `main.ts` 取 `nextLocalSlot()` 后写入 IndexedDB。这样删掉别的一首不会让剩下的歌换方块，删掉的那首的槽位也真的回到占位。上一轮导入的旧条目没有 `slot`，`planLocalSlots()` 按列表顺序补最小的空槽（确定性），并让显式 `slot` 优先，混合状态下也稳定。
- 歌手为空时 `applyLocalTracks` 写入 `UNKNOWN`，与 `local-tracks.displayArtist` 的界面约定一致。

## 启动竞态处理

IndexedDB 是异步的，首屏与阵列可能在曲库读回之前就建立。做法：

- `start()` 在创建 `ArchiveScene` 之前 `await loadLocalLibrary()`（= `refreshLocalTracks()` → 广播 → 订阅里 `applyLocalTracks` + `audio.setLocalTracks`）。曲库读回并覆盖占位槽之后，阵列才第一次建起来，因此**不会先按全占位渲染再错位或闪烁**；`drawTrackAtlas()` 烘焙与 `select(0)` 都发生在最终内容之后。
- 已入库曲目的播放目标在同一个 await 内完成重映射，`audio.configure` / `activate` 在其后，因此**不会出现「曲库回来时正在播放的曲目被打断」**。
- 曲库读取失败（隐私模式等）时只记录可读错误并继续：阵列退化为全占位，设置面板显示说明，其余功能不受影响。
- 之后每次增删改都通过 `subscribeLocalTracks` → `applyLocalTracks` 同步，运行期不再有竞态窗口。

## 删除与超限

- 删除：条目从 IndexedDB 移除后，`applyLocalTracks` 把该槽位写回 `{...baseRecords[index]}` —— 编号、列、原占位曲名与 PENDING 全部还原，`file` 回到 `null`。播放列表按上一轮的稳定标识重映射继续工作；正在播放的本地曲目被删时顺延到列表中的下一条（上一轮已确认的行为）。
- 阵列选择不回退：播放目标换到别曲目后，播放状态监听按**曲目标识**（不是下标）判断「播放的曲目真的换了」并让阵列向前跟随；暂停状态下被删曲目的顺延只更新界面、不写播放记录。顺延可能落到同一个下标上，所以这一判断不能按下标做。
- 超限：`importLocalFiles()` 逐个文件先取 `nextLocalSlot()`，为 `null` 时跳过该文件（不写 IndexedDB、不占位）并累计拒绝数量；结束后把「已导入 N 首 / M 项未导入」与「阵列占位槽已用尽（34 / 34）：M 个文件未导入（首个「文件名」）；删除已有本地曲目后可以继续导入。」一起写进设置面板状态行与提示，多选的部分成功、部分失败分开说明。
- 设置面板新增固定用量行 `阵列占位槽已使用 <b>3 / 34</b>，剩 31 个空槽`（用尽时改为「已用尽，删除已有本地曲目后可继续导入」），不新增视觉语言，沿用 `--theme-*` 令牌。

## 同步范围（逐个确认过）

- 阵列卡片状态：`drawLabel()` 用 `records[index]`，填充后自动变成 `READY · 本地音源`；`scene.refreshRecord()`（新增，只重画贴图）在曲库变化时刷新当前卡片的印刷面，不动几何、抬起高度、选择与镜头。`updateSelection()` 同步顶部标题、`READY/PENDING`、分类与底部刻度。
- 详情面板：`SOURCE` 对本地曲目显示 `LOCAL LIBRARY · 本机导入`（`title` 仍是 `local:<id>`），`STATUS` 显示 `可播放 · 本地曲库`，播放说明改为「音源来自本机导入的本地曲库（IndexedDB）…」；歌词页签对本地曲目说明「LRC 只与 tracks.json 里登记的曲目配套」；走带下方保留 `#playback-local` 标注。
- 曲库检索与收藏：`renderResults()` 检索 `id/title/artist/category`，填充后命中并显示 `READY`；收藏按 id（RM-0xx）保存，本地曲目被删后槽位回到占位、id 仍然存在，收藏列表不会报错也不会丢条目。
- 底部／顶部列名与计数：列归属继承占位槽，`columnFiles` 与刻度数量都不变。
- 播放状态监听：按 `musicTrackKey` 在 `records` 里找曲目；本地曲目未落到槽位（极端情况）时退化为「只记播放」，不动阵列选择。
- 设置面板本地曲库区块：`localLibraryMarkup` 的说明改为「导入后按顺序填入五列阵列的空占位槽」，并新增上述用量行；原先「不占用五列阵列」的文案已删除。

## 壁纸与 PWA

- 壁纸构建照旧：本地曲库与 PWA 同源可用，不引入新的宿主属性或权限；阵列覆盖是纯数据层行为，`build:wallpaper` 不受影响。
- PWA 资源缓存只操作 Cache Storage，不碰 IndexedDB；更新与缓存刷新不清除本地曲目（沿用上一轮结论）。

## 响应式与样式

- 只新增 `.local-usage` 一条状态行样式，字号、行高、`tabular-nums` 与 `.local-status` 一致，颜色全部走 `--theme-*`，亮暗两套主题自动成立；阵列本身不新增 UI。

## 验证

新增 `node scripts/check-local-array.mjs`（puppeteer-core + 系统 Edge 无头；`CHECK_URL` 指定地址，`CHECK_OUT` 指定证据目录）。测试音频由脚本自己生成：两个带分隔符的 25s / 30s WAV、33 个 15s 批量 WAV、1 个超限文件，不依赖用户准备文件。

断言与实测（`verification/local-array/local-array-report.json`，`passed: true`，`failures: []`，页面无报错；本报告与截图取自 `npm run preview` 的生产构建 `http://127.0.0.1:4173`）：

| 检查 | 实测 |
| --- | --- |
| 导入落在第一个空占位槽 | 两首填入 `records` 下标 4、5；`RM-005` 编号与列 `观测室` 不变，换成 `First Song` / `Alpha Artist` / 真实时长 25s / `file = local:<id>`；`RM-006` 同理 |
| 占位槽占用计数 | 状态行旁固定用量行 `阵列占位槽已使用 2 / 34，剩 32 个空槽` |
| 刷新后填充关系不变 | 刷新后 `RM-005` / `RM-006` 仍绑定同一 `localId`，占用仍为 2 |
| 库检索命中 | `TRACK INDEX` 检索 `First Song` 命中 `RM-005` 且状态 `READY` |
| 方块可选中并抽取进详情 | `RM-005` 卡片标题 `First Song`、状态 `READY`、分类 `观测室`；详情标题 `First Song`、歌手 `Alpha Artist`、`DURATION 00:25`、`SOURCE … LOCAL LIBRARY`、走带下方 `LOCAL LIBRARY · First Song · Alpha Artist` |
| 播放走本地音源 | `music.track` 的 `file === local:<id1>`，暂停／恢复都在同一条音源上 |
| 删除非播放中的曲目 | `RM-006` 回到 `pending: true` / `file: null` / `id RM-006` / 原占位曲名；阵列选择仍是 `RM-005`，播放未中断；用量回到 `1 / 34` |
| 填满 34 槽 | 33 个批量文件依次填入（刚释放的 `RM-006` 被 `Bulk Track 01` 占用，最后一个占位槽 `RM-040` 被填），用量 `已用尽`，列表 34 行 |
| 超限导入被拒绝 | 第 35 个文件未占位、未进列表（仍是 34），状态行 `阵列占位槽已用尽（34 / 34）：1 个文件未导入（首个「Overflow Artist - Overflow Song.wav」）；删除已有本地曲目后可以继续导入。` |
| 超限后不落库 | 再次刷新仍是 34 占用，`Overflow Song` 既不在曲库也不在阵列 |
| 删除正在播放的曲目 | `RM-005` 回到占位，播放顺延到下一条本地曲目，阵列向前跟随到 `RM-006`（不回退、不断循环） |

证据目录 `verification/local-array/`：

- `check-01-slots-filled.png`、`check-02-search-hit.png`、`check-03-slot-selected.png`、`check-04-detail-local-slot.png`、`check-05-plays-local-source.png`、`check-06-slot-restored.png`、`check-07-slots-full.png`、`check-08-over-limit-rejected.png`、`check-09-playing-deleted.png`：填入、检索、选中、详情、播放、槽位还原、占满、超限拒绝、删除播放中的曲目。
- `local-array-report.json`：断言、逐步状态快照（含 40 槽全量内容）与失败列表。

本轮回归（全部在本机实测）：

- `npx tsc --noEmit` 通过。
- `npm run build` 通过：`✔ built in 1.99s` + `Offline release 4b5fcf8c3d7add6c: 819 files, 30.8 MiB`（`exit=0`；PowerShell 管道上的 `NativeCommandError` 只是 stderr 噪声）。
- `npm run check:content` 18/18 通过。
- `node scripts/check-archive.mjs` 通过（40 曲目 / 34 占位槽 / 每列 8 份）：本轮顺带修好了它在曲库改造后残留的旧档案断言（原先读 `record.abstract` / `findings` / `source` 会直接抛错），改为一套曲目 schema 断言：编号连续 `RM-001…RM-040`、列归属、`pending` 与 `file/duration` 互斥、`tracks.json` 自身不带 `localId`。
- `node scripts/check-playback.mjs` 通过（dev server）：选曲即播、详情内原地换选、播放器切歌跟随、抬起卡片点击进详情。
- `node scripts/check-local-imports.mjs` 通过：导入、持久化、播放、编辑、删除与索引重映射。本轮按新行为更新了它的两处断言（本地曲目现在**进入**阵列）：播放本地曲目时阵列跟随到它占用的方块；删除正在播放的本地曲目后阵列跟随顺延到的那一条。其余断言（导入不打断播放、刷新后仍在、损坏文件提示等）不变。
- `node scripts/check-local-array.mjs` 通过（dev 与 `npm run preview` 生产构建各跑一遍）。

## 已知限制

- **阵列内容因设备而异**：占位槽的填充完全来自本机 IndexedDB，同一份 `tracks.json` 在不同设备上渲染出的卡片内容不同；换设备、清站点数据或换浏览器配置文件后，导入的曲目与填充关系都会消失。
- **同一首歌在不同机器上可能占不同槽位**：槽位序号随导入顺序（以及当时哪些槽空着）确定，没有跨设备一致的编号约定。
- **没有重排**：删除一首不会把后面的歌往前挪（这是刻意的，保证「同一首歌总落在固定方块上」的代价是槽位会空洞化）；重新导入会先补最小的空槽，因此新导入的歌可能出现在已有歌之前。
- **卡片只显示占位槽的身份**：卡面刻意不印导入曲名（决策 1），阵列上能认出它的是方块位置与详情面板；`track-atlas` 的索引签仍是隐藏的。
- **歌词**：LRC 只与 `tracks.json` 里登记的曲目配套，本地导入的曲目没有歌词。
- **`local:` 前缀可见**：详情面板 `SOURCE` 的 `title` 属性里仍是 `local:<id>`（屏幕文案已换成可读的 `LOCAL LIBRARY · 本机导入`）。
- **配额**：音频本体在 IndexedDB，配额由浏览器按源分配；写满时 `addLocalTrack` 抛「存储空间可能已满」，不会提示剩余容量。
- **PWA 与音频 seek（既有现象，与本轮无关）**：生产构建注册的 Service Worker 接管 `/audio/*` 后，`<audio>` 的 `duration` 与可寻址范围会退化（实测 `motif.ogg` 在 dev 上 `duration = 53.336`、拖动 70% 生效；在 `npm run preview` 下 `duration = 33.509`、拖动被重置到 0）。用 `page.setBypassServiceWorker(true)` 访问同一份生产构建即恢复正常（53.336 / 37.335），说明是既有的 SW + 媒体寻址交互，不是本轮改动：本轮 diff 未触碰 `src/audio.ts`、`src/pwa.ts`、`scripts/pwa-worker.js`、`src/asset-url.ts`。`check-playback.mjs` 的进度条断言因此在 production preview 下会失败，在 dev server 下通过（脚本默认地址即 dev server）。
- **壁纸未在真实 Wallpaper Engine 里复验**：阵列覆盖与宿主无关，但本轮没有实际运行壁纸宿主。
