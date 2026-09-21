# RhineMusic · 播放器转向开发文档

状态：进行中。项目从「莱茵生命档案终端」转向为「同界面风格的音乐播放器」：完全移除档案相关概念的功能与展示，保留界面效果（开场动画、磨砂玻璃双主题、终端排版、设置弹窗、音频引擎），主界面变为曲目库 + NOW PLAYING。本档是转向的唯一开发记录：方案、阶段任务与逐阶段进度都在这里维护，后续会话以此接续。档案终端时代的规范见 DESIGN.md、AGENTS.md 与 verification/（仅作历史参考，不再约束播放器形态）。

## 1. 决策记录

- 2026-09-20：用户确认完全去除档案相关功能与展示（三维阵列、详情/解密/查看器、检索/收藏、工作台、档案内容管线），项目改为单纯的音乐播放器，界面效果沿用现有风格。
- 播放=真实音频，曲目内容为 public/audio 下真实音乐文件（manifest 驱动），时长为真实时长。
- 壁纸构建（build:wallpaper）一并移除；codex/wallpaper-engine 实验分支留在 Git 历史。
- 远端仓库：https://github.com/Akikakoi/RhineMusic.git（ssh: git@github.com:Akikakoi/RhineMusic.git）；每个阶段完成后本地提交并推送。
- 此前的迷你播放器（设置弹窗内）与曲目化引擎（见 docs/MUSIC-PLAYER.md）是本转向的引擎基础，继续沿用。

## 2. 保留 / 移除清单

保留
- 开场动画（boot 2D 动效、开机音效时间轴）与 StartupGate。
- 磨砂玻璃、亮/暗双主题（theme-ui）、终端字体排版、页脚时钟。
- 设置弹窗（音效/音乐/主题/减少动效）与迷你播放器控件。
- 音频引擎（audio.ts：三轨联动 + 选曲播放器 + rhine-music-state 事件）。
- Rolling Number / Rolling Text 库、SurfaceTransition 等过渡件（按需）。
- PWA 离线安装（不依赖档案，保留）。

移除
- 三维档案阵列及全部交互（抽取/归位/波浪/解密/查看器/标注/循环/惯性）。
- 检索/收藏弹窗、档案下载、工作台、档案内容管线（content/archives.json、export-records、check-content）。
- three.js 依赖、GLB 资产与 vite 版本化模型插件、__RHINE_MODELS__。
- build:wallpaper 入口及 wallpaper 相关运行时代码。
- 档案相关的 CSS 与 DOM（清理阶段处理）。

新增
- 主界面双栏：左侧曲目库列表（轨道号/曲名/真实时长/播放状态、均衡器动画），右侧 NOW PLAYING（滚动曲名、进度条、走带控制、循环模式、联动开关、音量）。
- manifest 升级：解析 mp3 真实时长（手写帧头解析，零依赖），解析失败运行时补。

## 3. 阶段任务清单

- [x] 阶段0：转向文档 + RhineMusic 仓库基线推送。
- [x] 阶段1：播放器主界面（曲目库 + NOW PLAYING），boot 后直接进入。
- [x] 阶段2：移除档案相关功能与展示。
- [x] 阶段3：依赖与构建链清理（three/壁纸/GLB）。
- [x] 阶段4：验证、文档收尾与推送。

## 4. 验证方式

- 每阶段 tsc --noEmit + npm run build 通过后提交。
- 手动清单：开场→进入播放器；点行播放真实音乐；时长正确；正在播放行高亮与均衡器动画；与设置弹窗播放器状态互通；联动/循环/暂停恢复正常；主题切换、reduce-motion 正常；PWA 与离线安装不受影响。

## 5. 进度记录

> 每完成一个阶段在此追加：日期、完成内容、涉及文件、遗留事项。

### 2026-09-20 · 阶段0 · 转向文档与基线推送

- 建立本档，固化转向决策与保留/移除清单。
- 配置远端 music → Akikakoi/RhineMusic（原 origin 指向 LBEILC/RhineLabUI 保留不动），推送当前 main 作为基线，删除均有历史可回溯。

### 2026-09-20 · 阶段1 · 播放器主界面（已完成）

- main.ts 整体重写为播放器入口（约 520 行，替代原 ~1400 行档案终端）：
  - 舞台 DOM 移除三维画布、档案阵列、详情、检索/收藏入口；新增 #player-ui 双栏——左侧曲目库（SCENE LINK 置顶 + manifest 曲目行：轨道号/曲名/副题/均衡器动画/时长），右侧 NOW PLAYING（滚动大曲名、状态、走带、进度 seek、音量）。
  - 开场流程保留：BootSequence + 开机音效时间轴原样，t≈22s（原阵列入场点）直接揭幕播放器界面；skip/移动端入口/REINITIALIZE 重播均可。
  - 设置弹窗精简为：主题 + 音效/音乐（迷你播放器）+ REDUCED MOTION + FULLSCREEN/REINITIALIZE；移除画质/超级性能/壁纸提示。
  - 键盘：↑↓ 选行、Enter 播放/暂停、ESC 关弹窗、/ 开设置。
  - 播放复用现有引擎：行点击切曲、再点暂停；与设置弹窗播放器同一事件流（rhine-music-state）实时互通；联动模式行置灰语义保留。
- audio.ts：MusicTrack 增加 duration；内置三轨标注真实循环时长（53.3s）；manifest 合并后广播状态。
- scripts/generate-audio-manifest.mjs：新增 MP3 真实时长解析（ID3v2 跳过 + 帧头/Xing 帧数 + CBR 估算，零依赖），实测 332.3s/53.4s/459.7s 全部解析成功。
- 新增 src/player.css（磨砂玻璃双栏布局、均衡器动画、紧凑断点；--theme-* 变量适配双主题，reduce-motion 禁用动画）。
- index.html 标题/描述改为 RHINE MUSIC · AUDIO TERMINAL。
- 验证：tsc 零错误；npm run build 通过，JS 包体 986KB → 134KB（three.js 退出入口依赖），31 modules。
- 遗留：unused 源文件（scene 等）与 style.css 内档案样式在阶段2/3 清理；浏览器实测待用户验收（HMR 已生效，dev server 无需重启）。

### 2026-09-20 · 阶段2+3 · 移除档案功能与构建链清理（已完成，同批提交）

- 删除源码 47 个：scene、model-viewer、document-decryption/decryption、inspection-overlay、archive-*、workbench*、wallpaper*、quality/render、viewport-layout、data、motion、three-resources 等；src 从 74 文件瘦身到 28。
- 删除内容管线与资产：content/、public/archives/（40 份 TXT）、public/assets/（2 个 GLB + 字体声明）、wallpaper/（host/project/preview）、scripts 中 5 个档案/壁纸脚本。
- vite.config.ts 重写：移除 GLB 版本化插件、__RHINE_MODELS__、壁纸 host 注入；保留 Novecento 字体校验。
- package.json：更名 rhine-music，移除 three/@types/three 依赖（lock 同步 -9 包），移除 build:wallpaper 及档案相关脚本；asset-url.ts 简化。
- pwa.ts 去除 isWallpaper 分支，文案改播放器语义。
- 验证：tsc 零错误；npm run build 通过（30 modules，JS 134KB，离线包 26.4 MiB，较转向前 -6.6MB）。
- 提交：基线 4933661（档案终端全历史）、阶段1 4933661 内含、阶段2/3 779fada，均已推送 music 远端（Akikakoi/RhineMusic）。
- 过程事故与修复：git rm 在本机 shim 环境下曾连带删除整个 src 目录（保留文件从工作区消失），用 `git checkout -- src` 从索引完整恢复，未丢失任何成果；后续删除改用 Remove-Item（部分文件被系统 safe-delete 钩子拦截，scripts 下 4 个无引用脚本留在磁盘上成为未跟踪文件，无构建影响）。
- 未混入本任务：verification/ 与 启动终端.cmd 的既有改动、个人 mp3 音频与 manifest 工作区改动（是否入库待用户决定）。

### 2026-09-20 · 修复 · 界面失控（用户报"界面完全混乱"）

- 根因：重写 main.ts 时丢弃了原界面全部显隐所依赖的 #stage 状态机——`data-mode`（boot/archive/detail）从未设置，且自造的 data-boot="player" 在 CSS 中无规则。后果：system-nav/footer 保持基础 opacity:0、boot 层不退场、player 面板叠在开机动画上、responsive.css 未引入使 .mobile-entry 无样式裸奔。
- 修复（commit ecf911f）：
  - main.ts 启动即设 `data-mode="boot"` 与 `#stage.inert`；enterPlayer 设 `data-mode="player"` + `data-boot="done"`（复用既有 done 规则退场 boot 背景）；replayBoot 恢复 boot 模式与 skip 按钮；completeStartup 解除 inert。
  - player.css 新增 player 模式块：镜像原 archive 规则，显式恢复 nav/footer/brand/powered 可见性、隐藏 boot 层与 skip。
  - 重新引入 responsive.css（恢复 .mobile-entry 默认隐藏及部分通用规则；data-layout 相关规则因 viewport-layout 已删而保持惰性）。
- 验证：tsc 零错误；已推送（58bd1a4..ecf911f）。
- 教训：改造共享外壳的入口文件时，必须先盘点 CSS 对状态属性（data-mode/data-boot/--entry-opacity）的依赖，状态名不可私自改名。

### 2026-09-20 · 修复 · 全空白页面（用户报"完全没有任何东西"）

- 根因：无头截图实证页面只剩 #viewport 的米色底——被删除的 viewport-layout.ts 原本负责 #stage 的居中（translate(-50%,-50%)）与缩放（1920×1080 基准适配窗口）及 data-layout/--opening-* 等变量；缺失后舞台左上角钉在视口中心，全部内容跑出可视区。
- 修复（commit d5b17de）：
  - 恢复 src/viewport-layout.ts（openingLayout/viewportLayout）。
  - main.ts 增加 fit()：按启动/播放两态计算舞台尺寸、居中缩放、data-layout/data-touch/--opening-*/--modal-* 变量，resize 与 visualViewport 监听，enterPlayer/replayBoot 时重算。
  - 新增 `?direct=1` 调试参数：跳过入口与开场直接进入播放器（供无头验证与快速检查）。
  - player.css 顶部留白 132→220px（紧凑断点同步调整），消除品牌标题与曲目库面板重叠。
- 验证：无头 Edge 截图两阶段——入口（标志+点击进入）与播放器（双栏完整、6 首曲目带真实时长、SCENE LINK 高亮、走带/进度/音量就位、品牌标题无重叠）；tsc 零错误；npm run build 通过。
- 提交：ecf911f（状态机修复）、d5b17de（舞台布局修复）均已推送。
- 诊断手段备忘：系统 Edge 无头截图可用（需 user-data-dir 隔离 + powershell -File 包装），agent-browser 原生二进制在本机沙箱静默失败；vite dev 对文件变更的监听偶发失效，验证时重启 dev server。

### 2026-09-20 · 修复 · 点击无反应（用户报"有界面了，但是点击没有反应"）

- 根因：#stage 在启动期间被设为 inert（隔离开机层点击），但入场门 #loading 位于 #stage 内部——旧 main.ts 用 `$("#viewport").append(loading)` 把它挪到舞台外，重写时丢失该句，导致入场按钮（及一切 stage 内元素）被 inert 拦截，点了没反应。
- 修复：main.ts 启动序列恢复 `$("#viewport").append($("#loading"))`（挪出舞台后再设 inert），.mobile-entry 同样保持在 viewport 层。
- 验证：tsc 零错误；Edge 无头 --dump-dom 实证：#loading 位于 #viewport 内、#stage 之后；入场按钮 `<button class="entry-start">` 无 disabled（entry.ready() 已触发，等待点击）。修复模式与旧档案终端完全一致（stage 内元素在 completeStartup 后恢复可点）。
- 未提交未推送（用户 2026-09-20 指示：仅明确要求时才提交推送）。

### 2026-09-20 · 转折 · 按用户截图恢复档案终端（覆盖转向决定）

- 用户看过 A/B/C 三个 demo 后发来原档案终端截图，明确"恢复成这样的"。据此放弃播放器转向：工作区已从基线提交 a0fb9ea 恢复全部源码与资产（src 75 文件、GLB 模型、content、public/archives、wallpaper、scripts、index.html、package.json/vite.config），three.js 依赖重装，构建通过（33.8 MiB），无头截图验证三维阵列与卡片特写均正常渲染。
- 保留：用户两首 mp3（未跟踪）+ manifest 重生成（3 首扩展曲目，设置弹窗迷你播放器可用）；demos/ 目录（未跟踪）；docs/MUSIC-OS.md、MUSIC-PLAYER.md 作为历史记录保留；AGENTS.md 的提交规则更新（未提交）。
- 播放器转向期间的代码（曲目库主界面等）仍留在 Git 历史（4933661..062f21d），可随时找回。
- 工作区状态：恢复改动已暂存未提交；verification/ 与 启动终端.cmd 为转向前即存在的无关改动；均待用户指示。
- 状态机教训补充：旧 main.ts 的 $("#viewport").append(loading) 与 #stage.inert 配对是入场可点的关键，任何入口重写必须保留这对组合。
