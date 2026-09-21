// 交互检查：选曲即播放、详情内原地换选、播放器切歌后界面跟随。
// 需要本机 dev server（默认 http://127.0.0.1:5173）与系统 Edge。
//   node scripts/check-playback.mjs
//   CHECK_URL=http://127.0.0.1:5190 node scripts/check-playback.mjs
// 环境变量：CHECK_URL、EDGE_PATH、CHECK_SHOTS（截图目录，缺省不截图）。
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = `${process.env.CHECK_URL ?? "http://127.0.0.1:5173"}/?scene=archive&reduced=1`;
const shots = process.env.CHECK_SHOTS;
const edge =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (shots) mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    // The check drives playback without a click in the page, so autoplay must be allowed.
    "--autoplay-policy=no-user-gesture-required",
  ],
  defaultViewport: { width: 1920, height: 1080 },
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const page = await browser.newPage();
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const read = () =>
  page.evaluate(() => ({
    mode: document.querySelector("#stage")?.dataset.mode,
    code: document.querySelector("#selected-code")?.textContent?.trim() ?? "",
    heading: document.querySelector("#detail-content h2")?.textContent?.trim() ?? "",
    nowPlaying: document.querySelector(".now-playing strong")?.textContent?.trim() ?? "",
    elapsed: document.querySelector("#playback-elapsed")?.textContent?.trim() ?? "00:00",
    music: window.rhineMusicState?.() ?? null,
  }));

const failures = [];
const expect = (value, message) => {
  if (!value) failures.push(message);
};
const shot = async (name) => {
  if (shots) await page.screenshot({ path: `${shots}/check-${name}.png` });
};

try {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#stage")?.dataset.boot === "done", { timeout: 60000 });
  await wait(1200);

  // 1. 选曲即播放：选中播放列表第二首 MOTIF 后应当自动起播
  await page.keyboard.press("ArrowDown");
  await wait(1800);
  const selected = await read();
  expect(selected.code.includes("002"), `选中后编号应为 002，实际 ${selected.code}`);
  expect(selected.music?.playing === true, `选曲后应自动起播，实际 ${JSON.stringify(selected.music)}`);
  expect(selected.music?.tracks?.[selected.music.track]?.title === "MOTIF", `播放曲目应为 MOTIF，实际 ${selected.music?.tracks?.[selected.music?.track]?.title}`);
  await shot("1-autoplay");

  // 2. 进入详情
  await page.keyboard.press("Enter");
  await wait(1500);
  const detail = await read();
  expect(detail.mode === "detail", `进入详情后模式应为 detail，实际 ${detail.mode}`);
  expect(detail.heading === "MOTIF", `详情标题应为 MOTIF，实际 ${detail.heading}`);
  await shot("2-detail");

  // 2b. 播放中可以调进度
  const seekState = await page.evaluate(() => {
    const el = document.querySelector("#playback-seek");
    if (!el) return { ok: false, reason: "详情面板没有进度条" };
    el.value = "700";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true, disabled: el.disabled };
  });
  await wait(900);
  const seeked = await read();
  const ratio = seeked.music && seeked.music.duration > 0 ? seeked.music.time / seeked.music.duration : 0;
  expect(seekState.ok, `进度条不可用：${seekState.reason}`);
  expect(seekState.disabled === false, "播放中的进度条不应被禁用");
  expect(ratio > 0.6 && ratio < 0.86, `拖到 70% 后播放位置应落在 0.6–0.86，实际 ${ratio.toFixed(3)}`);
  await shot("2b-seek");

  // 3. 详情内换曲目：留在详情，只换内容与封面，并切到该曲目播放
  await page.keyboard.press("ArrowDown");
  await wait(1800);
  const swapped = await read();
  expect(swapped.mode === "detail", `详情内换曲目应留在详情，实际 ${swapped.mode}`);
  expect(swapped.heading === "PULSE", `换曲后详情标题应为 PULSE，实际 ${swapped.heading}`);
  expect(swapped.code.includes("003"), `换曲后编号应为 003，实际 ${swapped.code}`);
  expect(swapped.nowPlaying === "PULSE", `NOW PLAYING 应为 PULSE，实际 ${swapped.nowPlaying}`);
  expect(swapped.music?.tracks?.[swapped.music.track]?.title === "PULSE", `播放应切到 PULSE，实际 ${swapped.music?.tracks?.[swapped.music?.track]?.title}`);
  await shot("3-swap-in-detail");

  // 4. 播放器切下一首：仍在详情内跟随到 DORIKO（RM-009）
  await page.click('[data-action="play-next"]');
  await wait(2000);
  const followed = await read();
  expect(followed.mode === "detail", `播放器切歌应留在详情，实际 ${followed.mode}`);
  expect(followed.code.includes("009"), `切歌后应跟随到 009，实际 ${followed.code}`);
  expect(followed.heading === "DORIKO、初音ミク - 歌に形はないけれど", `切歌后详情标题应为 DORIKO 曲目，实际 ${followed.heading}`);
  await shot("4-follow");

  expect(errors.length === 0, `页面报错：${errors.join(" | ")}`);

  // 5. 点击已经抬起的那张卡片应当进入播放界面
  await page.keyboard.press("Escape");
  await wait(1600);
  // 抬起的那张卡片会被后排卡片部分遮挡，按场景投影取它的几个纵向位置逐个试。
  const probePoints = () =>
    page.evaluate(() => {
      const s = window.rhineSceneStats?.();
      if (!s?.topLeft || !s?.topRight) return [];
      const [lx, ly] = s.topLeft, [rx, ry] = s.topRight;
      const cx = (lx + rx) / 2, cy = (ly + ry) / 2, w = Math.abs(rx - lx);
      return [
        [cx, cy + w * 0.12],
        [cx, cy + w * 0.24],
        [cx, cy + w * 0.34],
      ];
    });
  let opened = false;
  for (let attempt = 0; attempt < 4 && !opened; attempt++) {
    const points = await probePoints();
    expect(points.length > 0, "无法从场景投影定位抬起的卡片");
    for (const [x, y] of points) {
      await page.mouse.click(x, y);
      await wait(1400);
      if ((await read()).mode === "detail") {
        opened = true;
        break;
      }
    }
  }
  expect(opened, "点击已抬起的卡片应进入播放界面，但模式仍停在阵列");
  await shot("5-click-open");
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`播放交互检查失败：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("播放交互检查通过：选曲即播放、详情内原地换选、播放器切歌跟随均正常。");
