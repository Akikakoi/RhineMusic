# 曲名索引签（TRACK-LABELS）

需求：阵列里每块卡片上方显示曲目名。方案（用户选定）：上沿索引签 + 单张图集 + 全部显示 + 悬停反馈。

## 实现

- `src/track-atlas.ts`：40 条曲名画进 2048×2000 图集（4 列 × 10 行，每格 512×200）。
  纸色 #cfc8b6、4px 深色边框、92px 起字号（放不下逐级缩字、尾部省略号）。
- `src/scene.ts`：单个 InstancedMesh 立牌，316~318 实例，实例矩阵直接复用卡片批次
  的共享 buffer——抬升、波浪、倾斜自动跟随。几何：PlaneGeometry(3.9, 1.5)，
  rotateX(-18°) 上端后仰，底边落在卡片顶面后缘（local y ≈ 3.78）。
- UV：onBeforeCompile 注入 `vMapUv = uv * (1/4, 1/10) + tabUv`，`tabUv` 为每实例
  图集偏移（InstancedBufferAttribute，逐帧按 drawnCells 写入）。
- 悬停反馈暂缺：instanceColor 与本配置不兼容（见下），半透明叠加板又被用户感知为
  "标签变透明"，已移除。悬停仍沿用卡片本身的抬起动效。

## 排查记录（为什么折腾了这么久）

1. **纸叠白**：初版纸色 #e6e2d9 与受光卡片顶面几乎同色，加上景深模糊，整签如透明
   塑料片（用户反馈"变得透明了"）。对策：纸色加深至 #cfc8b6 + 加粗边框。
2. **贴顶面被自身卡片遮挡**：默认阵列相机几乎与卡片平齐，平放顶签压成一条线。
   对策：改为斜立式立牌，任何角度都有正对相机的面。
3. **预拉伸裁字**：初版按"19° 仰角、深度压缩 3.4 倍"假设做纵向预拉伸，把 80px
   格子里的 30px 字拉伸到 102px 直接裁碎。实测屏幕投影接近各向同性，假设不成立。
4. **Three.js 静默消失坑（最重要）**：InstancedMesh + MeshBasicMaterial + map +
   onBeforeCompile 注入时，叠加以下任一项都会让整个实例网格不再光栅化，且无任何
   着色器报错、draw call 正常、`renderer.info` 看不出异常：
   - `themeMaterial()` 钩子
   - 自定义 `customProgramCacheKey`
   - `instanceColor`（即使全部填 1）
   最终可用组合：map + UV 注入 + tabUv 实例属性，不带上述三项。
   另：把该 mesh 推入 `this.instances` 做 count 同步后同样不可见（原因未查明，
   待查），当前保持不推入、count 用构造容量。
5. **调试方法教训**：getStats 里的 `camera.fov`/距离存在陈旧值，不能用于几何推断；
   无头截图的相机受指针位置影响（默认指到 (0,0)），与用户实机取景不同，标签问题
   必须先对齐视角再判断。esbuild 会把 0xff00ff 转成 16711935、改掉局部变量名、
   删掉注释，验证服务模块内容时不要按源码字面 grep。
6. **vite 缓存假象**：改完 scene.ts 后 curl 到的内容可能滞后一轮（本机已多次复现），
   怀疑渲染结论前先确认服务模块内容。

## 下线（2026-09-21 晚，用户要求）

用户确认不要当前形态的曲名标签，主界面整排隐藏：

- `main.ts` 在两处场景创建点（启动加载、设置里重载 3D）调用 `scene.setTrackLabels(false)`；
  图集、InstancedMesh、UV 注入等机制全部保留，之后做新标签方案时调 `setTrackLabels(true)` 即可恢复。
- 顺带修正：曲目 id 从档案的 `X-001` 换成 `RM-002` 后，`main.ts` 两处 `id.slice(2)`
  取到的是 `-002`（Number 后为负），编号显示成 `RM--002`（双横线）；已改为按 `-`
  分段取尾段。
- 文中提到的截图 `tab-standing.png` / `tab-v2.png` 已随临时截图清理删除，不复存在。
- 回归：`npm run check:playback` 全部通过（CHECK_URL=http://127.0.0.1:5195）；
  `npx tsc --noEmit` 通过。

## 验证

- `npx tsc --noEmit` 通过；`npm run build` 通过。
- 下线前的实现验证：`node scripts/check-playback.mjs` 6 项断言通过，播放交互无回归；
  远排立牌文字可辨（截图已随临时产物清理删除）。实机观感以用户确认为准。
