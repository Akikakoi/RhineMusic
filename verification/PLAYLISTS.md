# 播放列表验证

2026-09-26。验证「命名播放列表 + 播放队列」以及「收藏功能已彻底移除」。需求与实现见 [docs/PLAYLISTS.md](../docs/PLAYLISTS.md)。

## 命令

```sh
npm run dev
CHECK_URL=http://127.0.0.1:5174 npm run check:playlists
```

脚本用 `puppeteer-core` 驱动系统 Edge 无头（默认 `CHECK_URL=http://127.0.0.1:5173`、`CHECK_OUT=verification/playlists`）；测试曲目直接用仓库里的内置三轨（`atmosphere` / `motif` / `pulse`），不需要自造 fixture。

## 断言与实测（`verification/playlists/playlists-report.json`，`passed: true`，0 失败、0 页面报错）

| 检查 | 实测 |
| --- | --- |
| 弹窗初始为空态并给出新建入口 | `playlists.lists.length === 0`，显示空态文案 |
| 新建即填满曲库 | 新建「夜间频率」后 `tracks.length === 6`（= 曲库全部），首条 `atmosphere`，列表计数 `6 首`，弹窗 6 行 |
| 移除 + 从详情加回 | 删掉最后一行后 5 首；在详情页把该曲目加回后恢复 6 首 |
| 整条播放 | `queued === true`、`wanted === 0`、`playing === true`，`tracks` 长度 6，当前曲目 `atmosphere`，列表条目带播放标记 |
| 行内播放 | `playlist-track-play` 第二首 → 当前曲目就是第二首、`wanted === 1` |
| 排序 | 第二首上移后列表首位与引擎队列首位同时变成它 |
| 移除正在播放的曲目 | 列表与队列都变成 5 首，仍处于队列模式且继续播放 |
| 删除列表 | 列表清空、`active === null`、`queued === false`，队列回到整个曲库 `tracks.length === 6` |
| 失效项 | 预置 `["local:missingentry", "atmosphere"]` 后刷新：2 行、其中 1 行标为失效 |
| 失效项播放 | 播放该列表时队列只有 1 首（失效项被跳过） |
| 持久化 | `localStorage['rhine-playlists']` 里仍有该列表 |

## 证据（`verification/playlists/`）

- `check-01-empty.png`：空态（左列列表栏 + 新建入口）。
- `check-02-created-filled.png`：新建「夜间频率」——自动填入 6 首、底部 toast「已新建列表：夜间频率 · 已填入 6 首」。
- `check-03-playing-list.png`：整条播放中——列表条目高亮、正在播放标记、底部 toast「正在播放列表：夜间频率」。
- `check-04-reordered.png`：上移后的顺序。
- `check-05-removed.png`：移除正在播放的曲目后队列剩 5 首。
- `check-06-deleted.png`：删除列表后回到整个曲库。
- `check-07-missing-entry.png`：含失效项的列表。
- `playlists-report.json`：断言、逐步状态快照与失败列表。

## 回归

- `npx tsc --noEmit` 通过。
- `npm run build` 通过（`✓ built in 1.80s`；`Offline release efacf2ed3536705d: 819 files, 30.8 MiB`）。
- `CHECK_URL=http://127.0.0.1:5174 npm run check:covers` 通过（内嵌封面不受影响）。
- `CHECK_URL=http://127.0.0.1:5174 node scripts/check-local-imports.mjs` 通过（本地曲库/阵列不受影响）。
- 页面无 `pageerror`；控制台无 error。

## 备注

- 收藏相关的可执行检查只散落在 `check-responsive` / `check-pwa` / `check-font-update` / `check-pwa-recovery` 里，已把探针从 `rhine-saved` 换成 `rhine-playlists`；这些脚本依赖 playwright，本机未安装（仓库只装了 `puppeteer-core`），本轮未执行。
- 播放队列按设计不持久化：刷新后 `queued === false`，这条也在断言里。
