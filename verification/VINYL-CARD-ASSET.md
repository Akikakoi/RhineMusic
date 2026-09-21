# 黑胶唱片袋卡片资产

2026-09-21。RhineMusic 方向确定后的第一份资产：档案卡改为黑胶唱片袋。本轮只做资产与契约，尚未接入阵列。

## 形态与几何

- 面尺寸沿用现有卡片：宽 5.0、高 3.7（世界单位），滑套总厚 0.36，纸板厚 0.05。
- 滑套右侧开口（+X），抽取时唱片沿 +X 滑出，可滑范围 0 → 2.9。
- 内层自外向内：前片 → 唱片（半径 1.78、厚 0.075、含中心标签）→ 内衬纸袋 → 后片；唱片与滑套内壁单边余量约 0.02，不与纸板相交。
- 杏金边条贴在滑套左侧外沿（沿用阵列既有的暖杏金信号色），索引签位于前片左下。

## 命名契约

与 `src/scene.ts`、`src/appearance.ts` 对齐：X = 宽、Y = 高、Z = 厚度（正面朝 +Z）。

| 表面名 | 拆解组 | 说明 |
| --- | --- | --- |
| Sleeve_Paper | cover / carrier | 前片；后片 + 书脊 + 上下边 |
| Sleeve_Liner | substrate | 内衬纸袋 |
| Vinyl_Record | optical-core | 黑胶唱片本体与边缘环 |
| Vinyl_Label | optical-lenses | 杏金中心标签 |
| Amber_Lightguide | fasteners | 左侧边条 |
| Index_Inlay | fasteners | 左下索引签 |

- 表面名写在 `material.name`，同时写入 `mesh.userData.surface`；拆解组写入 `mesh.userData.assemblyPart`。三者缺一，应用侧的材质重建、磨砂/主题状态与拆解查看器都会失效（本轮曾因漏设 `material.name` 导致导出物无材质名）。
- 拆解组沿用既有六组英文名，360° 查看器无需改动分组逻辑。

## 资产与脚本

- `art/build_vinyl_sleeve.mjs`：几何定义与 GLB 导出的唯一来源。输出 `public/assets/vinyl-sleeve.glb`（11 网格，113 KiB）与 `public/assets/vinyl-sleeve-assembly.glb`（7 网格，109 KiB，厚度放大 3× 便于观察层叠）。
- 导出用 three.js 的 `GLTFExporter`。Node 缺少 `FileReader`，脚本内做了最小 polyfill；否则二进制写出直接抛 `ReferenceError`。
- **本机未安装 Blender，也没有 Blender MCP 配置**，因此本轮资产是程序化导出的过渡版本，违反 `AGENTS.md` 中"美术资源必须通过 Blender MCP 制作"。几何参数与材质名即 Blender 版的规格来源；补齐 Blender 后应据本表重建，保持同一契约。

## 核对入口

`reference/vinyl-model-review.html`（需 dev server，如 `npx vite --host 127.0.0.1 --port 5190 --strictPort`）：
阵列姿态（3 列 × 4 行、行距 0.62）、抽取姿态（唱片滑出滑块）、拆解模型三视图，并将载入后的表面名、拆解组、顶点数与网格名逐条列出，用于确认契约未被导出过程破坏。

无头截图：`.tools/screenshot.ps1 -Url <页面> -Out <png> -Size <宽,高>`。

## 坐标约定（2026-09-21 修正）

`archive-cassette.glb` 的世界包围盒为 X −2.5…2.51、**Y 0…3.7（原点在卡片下边缘）**、Z −0.130…0.246。
资产最初以原点居中（Y −1.85…1.85）导出，直接接入会让卡片在阵列里浮空半个卡高。现按同一约定生成（`BASE_Y = H/2`、`BASE_Z = 0.058`），世界包围盒为 X −2.53…2.50、Y 0…3.70、Z −0.122…0.252，与档案卡一致。

索引签同时移到档案标签平面的原位（−1.36, 3.04, 0.255 附近），因此 `src/scene.ts` 的标签坐标无需改动。

## 接入阵列与抽取（第 1、2 步，已完成）

- `src/scene.ts`：默认资产改为 `vinyl-sleeve.glb`；新增 Sleeve_Paper / Sleeve_Liner / Vinyl_Record / Vinyl_Label / Amber_Lightguide 的材质配置；阵列实例白名单加入 `Sleeve_Paper`（否则阵列里只剩索引签可见）。
- 抽取动画：新增 `recordBasis` / `recordSlide` 与 `updateRecordSlide()`，把抬起 0.6 → 4.05 映射为唱片与中心标签沿 +X 位移 0 → 2.75（`ease` 加速）。预览抬起（0.4）阶段唱片保持全收，`select()` 中归位克隆会把唱片位移重置为 0。
- `src/theme-material.ts`：补 5 个新表面的暗色主题色。
- 核对入口 `reference/vinyl-array-review.html` 直接驱动 ArchiveScene（跳过开场）：阵列实例为 `Sleeve_Paper、Index_Inlay`；抽取 96 帧后抬起 4.016、唱片与中心标签位移均为 2.750；阵列 340 张卡片、56173 三角面。`tsc --noEmit` 与 `npm run build` 均通过。
- 注意：磨砂变清晰（clarity）在纸套上没有作用面，玻璃揭示实际失效；右侧正文揭示链路未改动。

## 遗留

- 滑套正面为空白纸面，曲名、歌手与封面由应用侧的画布标签贴图提供；下一步需把标签平面从 0.99 × 0.46 放大到滑套正面可印区域（当前只用作左下索引签）。
- 360° 查看器仍加载 `archive-assembly.glb`（六组档案盒结构），尚未换成 `vinyl-sleeve-assembly.glb`；part 标签文案也需按滑套语义调整。
- `vite.config.ts` 的模型清单仍只登记两个档案 GLB：生产构建会照旧发射 3.5 MB ×2 的档案模型，而黑胶资产只是从 `public/` 原样拷入、未做哈希版本化。切完查看器后应把清单换成黑胶资产。
- 本机未安装 Blender，当前资产为程序化导出的过渡版本，待补齐 Blender 后按本文件契约重建。
