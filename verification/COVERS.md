# 内嵌封面验证

2026-09-26。验证「导入带内嵌封面的音频 → 选中卡片正面右半区画出封面；无封面留空」。需求与实现见 [docs/COVERS.md](../docs/COVERS.md)。

## 命令

```sh
npm run dev
CHECK_URL=http://127.0.0.1:5174 npm run check:covers
```

脚本用 `puppeteer-core` 驱动系统 Edge 无头（默认 `CHECK_URL=http://127.0.0.1:5173`、`CHECK_OUT=verification/covers`）。测试文件由脚本自己生成，不依赖手工准备：

- `Cover Artist - Cover Song.mp3`：脚本自造 ID3v2.3 标签（`APIC`、PNG 48×48）+ `public/audio/observatory-preview.mp3` 去掉原 ID3 后的 MPEG 帧，保证能解码。
- `Plain Artist - No Cover Song.wav`：普通 WAV，没有封面字段。

## 断言与实测（`verification/covers/covers-report.json`，`passed: true`，0 失败、0 页面报错）

| 检查 | 实测 |
| --- | --- |
| 导入带 `APIC` 的文件后数据层标记有封面 | `library.entries[0].cover === true`；覆盖后的方块带 `cover === true` |
| 无内嵌封面的文件标记为没有封面 | `library.entries[1].cover === false` |
| 选中带封面曲目后卡片印刷面画出封面 | 播放 `Cover Song` → 阵列跟随到 `RM-005` → `label = { index: 4, cover: "ready" }` |
| 选中无封面曲目时右半留空 | 播放 `No Cover Song` → 阵列跟随到 `RM-006` → `label = { index: 5, cover: "none" }` |
| 详情视图渲染带封面的印刷面 | `.read-file` 进入 `mode === "detail"`，截图见下 |
| 刷新后封面仍在 | 刷新后 `library.entries` 里仍有 1 条 `cover === true` |

## 证据（`verification/covers/`）

- `check-01-imported-cover-song.png`：设置面板里导入带封面文件后的曲库行。
- `check-02-cover-on-card.png`：导入 2 条后仍在设置面板，播放曲目为 `Cover Song`。
- `check-03-archive-cover-selected.png`：合上设置后的阵列视图（选中 `RM-005`）。
- `check-04-detail-cover-card.png`：详情里卡片正面——左半编号/分类/曲名/歌手/时长/状态，右半封面铺满、无上下留边。
- `check-05-no-cover-on-card.png`：播放无封面曲目后的设置面板。
- `check-06-archive-no-cover-selected.png`：阵列视图（选中 `RM-006`）。
- `check-07-detail-no-cover-card.png`：详情里无封面卡片正面——右半保持纸面留空，没有边框。
- `covers-report.json`：断言、逐步状态快照与失败列表。

## 回归

- `npx tsc --noEmit` 通过。
- `npm run build` 通过（`✓ built in 2.12s`；`Offline release …: 819 files, 30.8 MiB`）。
- `CHECK_URL=http://127.0.0.1:5174 node scripts/check-local-imports.mjs` 通过：导入、持久化、播放、编辑、删除与索引重映射都没有回归。
- 页面无 `pageerror`；控制台无 error。

## 备注

- 刷新后的持久化断言读的是 `stats().library.entries`（数据层），不是设置面板的 DOM 行——刷新流程结束时设置弹窗是关的，所以该步 `rows` 为 0。
- 封面铺满右半区（cover + clip），方图会左右各裁掉约 15%；如需完整不裁切，要么重新出现上下留边，要么把左半文字栏压窄给封面更多横向空间。
