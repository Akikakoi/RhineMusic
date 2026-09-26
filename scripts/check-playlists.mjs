// 播放列表检查：新建（自动填满曲库）、加入、整条播放、排序、移除、删除、失效项与刷新持久化。
// 需要本机 dev server（默认 http://127.0.0.1:5173）与系统 Edge。
//   node scripts/check-playlists.mjs
//   CHECK_URL=http://127.0.0.1:5190 node scripts/check-playlists.mjs
// 环境变量：CHECK_URL、EDGE_PATH、CHECK_OUT（证据目录，缺省 verification/playlists）。
import puppeteer from "puppeteer-core";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = `${process.env.CHECK_URL ?? "http://127.0.0.1:5173"}/?scene=archive`;
const edge =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = resolve(process.env.CHECK_OUT ?? "verification/playlists");
mkdirSync(out, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const expect = (value, message) => {
  if (!value) failures.push(message);
};

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-angle=d3d11",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.emulateMediaFeatures([
  { name: "prefers-reduced-motion", value: "reduce" },
]);
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

const read = () =>
  page.evaluate(() => {
    const stats = window.rhine?.stats?.() ?? null;
    const music = window.rhineMusicState?.() ?? null;
    return {
      playlists: stats?.playlists ?? null,
      selected: stats?.selected ?? "",
      mode: stats?.mode ?? "",
      hint: document.querySelector(".playlist-hint")?.textContent?.trim() ?? "",
      items: [...document.querySelectorAll(".playlist-item")].map((element) => ({
        id: element.dataset.playlist ?? "",
        name: element.querySelector("b")?.textContent?.trim() ?? "",
        count: element.querySelector("small")?.textContent?.trim() ?? "",
        active: element.classList.contains("active"),
        playing: element.classList.contains("playing"),
      })),
      rows: [...document.querySelectorAll(".playlist-row")].map((element) => ({
        key: element.dataset.key ?? "",
        title: element.querySelector(".playlist-name b")?.textContent?.trim() ?? "",
        missing: element.classList.contains("playlist-row--missing"),
      })),
      placeholder: document.querySelector(".playlist-placeholder")?.textContent?.trim() ?? "",
      music: music
        ? {
            queued: music.queued,
            track: music.track,
            wanted: music.wanted,
            playing: music.playing,
            files: music.tracks.map((track) => track.file),
          }
        : null,
    };
  });

const playingKey = (state) =>
  state.music && state.music.track >= 0 ? state.music.files[state.music.track] ?? "" : "";

/** 曲库里的全部曲目（无队列时的播放列表）。 */
const librarySize = () =>
  page.evaluate(() => window.rhineMusicState?.()?.tracks?.length ?? 0);
/** 按标识找到对应的曲目下标（占位槽不算）。 */
const recordIndexOf = (key) =>
  page.evaluate((wanted) => {
    const slots = window.rhine?.stats?.().library?.slots ?? [];
    const normalize = (file) =>
      file && !file.startsWith("local:") ? file.replace(/\.(ogg|mp3)$/i, "") : file;
    const slot = slots.find(
      (item) => !item.pending && item.file && normalize(item.file) === wanted,
    );
    return slot ? slot.index : -1;
  }, key);

let shotIndex = 0;
const report = { url, checks: [], shots: [], steps: {}, failures, errors };
const shot = async (name) => {
  shotIndex++;
  const file = `check-${String(shotIndex).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: `${out}/${file}` });
  report.shots.push(file);
};
const step = async (name) => {
  report.steps[name] = await read();
};
const clearEvidence = () => {
  for (const file of readdirSync(out))
    if (/^check-\d+.*\.png$/.test(file)) rmSync(`${out}/${file}`, { force: true });
  report.shots = [];
  shotIndex = 0;
};
const openPlaylists = async () => {
  await page.click('[data-action="playlists"]');
  await page.waitForSelector(".playlist-layout", { timeout: 20000 });
  await wait(600);
};
const closeModal = async () => {
  if (!(await page.$(".modal-backdrop"))) return;
  await page.click('[data-action="close-modal"]');
  await page.waitForFunction(() => !document.querySelector(".modal-backdrop"), {
    timeout: 10000,
  });
  await wait(500);
};
const clickListItem = async (index = 0) => {
  const items = await page.$$(".playlist-item");
  expect(Boolean(items[index]), `第 ${index + 1} 个列表条目不存在`);
  if (items[index]) await items[index].click();
  await wait(700);
};
/** 详情面板里把当前曲目加入列表（选第一个列表）。 */
const addCurrentToFirstList = async () => {
  await page.click('.detail-actions [data-action="playlist-add"]');
  await page.waitForSelector(".playlist-hint", { timeout: 10000 });
  await clickListItem(0);
  await closeModal();
};
const clickListAction = async (action, key) => {
  const selector = key
    ? `[data-action="${action}"][data-key="${key}"]`
    : `[data-action="${action}"]`;
  const target = await page.$(selector);
  expect(Boolean(target), `找不到 ${selector}`);
  if (target) await target.click();
  await wait(1200);
};

try {
  clearEvidence();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("#stage")?.dataset.boot === "done",
    { timeout: 60000 },
  );
  await wait(1500);

  const library = await librarySize();
  expect(library > 1, `曲库应有不止一首曲目，实际 ${library}`);

  // 1. 弹窗初始态：没有列表。
  await openPlaylists();
  const empty = await read();
  expect(empty.playlists?.lists?.length === 0, "初始不应有播放列表");
  expect(Boolean(empty.placeholder || empty.items.length === 0), "空态应给出提示");
  await shot("empty");
  await step("empty", empty);
  report.checks.push("playlist modal opens empty and offers the new-list entry");

  // 2. 新建列表：自动填入整个曲库。
  await page.click('[data-action="playlist-new"]');
  await page.waitForSelector("#playlist-name", { timeout: 10000 });
  await page.type("#playlist-name", "夜间频率");
  await page.click('[data-action="playlist-create"]');
  await wait(800);
  const created = await read();
  expect(created.playlists?.lists?.length === 1, `新建后应有 1 个列表，实际 ${created.playlists?.lists?.length}`);
  expect(created.items[0]?.name === "夜间频率", `列表名应为「夜间频率」，实际 ${created.items[0]?.name}`);
  expect(
    created.playlists?.lists?.[0]?.tracks?.length === library,
    `新列表应自动填入曲库全部 ${library} 首，实际 ${created.playlists?.lists?.[0]?.tracks?.length}`,
  );
  expect(
    created.items[0]?.count === `${library} 首`,
    `列表计数应为 ${library} 首，实际 ${created.items[0]?.count}`,
  );
  expect(
    created.rows.length === library,
    `弹窗里应列出 ${library} 行，实际 ${created.rows.length}`,
  );
  expect(
    created.playlists?.lists?.[0]?.tracks?.[0] === "atmosphere",
    `填入顺序应与曲库一致（首条 atmosphere），实际 ${created.playlists?.lists?.[0]?.tracks?.[0]}`,
  );
  await shot("created-filled");
  await step("created-filled", created);
  report.checks.push("creating a list auto-fills every track of the library, in library order");

  // 3. 删掉最后一首，再从详情把它加回来。
  const removedKey = created.rows[created.rows.length - 1]?.key ?? "";
  expect(Boolean(removedKey), "应能取到最后一行的标识");
  await clickListAction("playlist-remove", removedKey);
  const afterRemove = await read();
  expect(
    afterRemove.playlists?.lists?.[0]?.tracks?.length === library - 1,
    `移除后应为 ${library - 1} 首，实际 ${afterRemove.playlists?.lists?.[0]?.tracks?.length}`,
  );
  expect(
    !afterRemove.playlists?.lists?.[0]?.tracks?.includes(removedKey),
    "被移除的标识不应还在列表里",
  );
  await closeModal();

  const index = await recordIndexOf(removedKey);
  expect(index >= 0, `应能在曲库里找到 ${removedKey} 对应的曲目`);
  await page.evaluate((i) => window.rhine.select(i), index);
  await wait(800);
  await page.click(".read-file");
  await wait(2200);
  expect((await read()).mode === "detail", "应能进入详情面板");
  await addCurrentToFirstList();
  const restored = await read();
  expect(
    restored.playlists?.lists?.[0]?.tracks?.length === library,
    `从详情加回后应恢复为 ${library} 首，实际 ${restored.playlists?.lists?.[0]?.tracks?.length}`,
  );
  report.checks.push("removing a track then adding it back from the detail panel restores the list");

  // 4. 播放整个列表：引擎切到队列，从第一首开始。
  await openPlaylists();
  await page.click('[data-action="playlist-play"]');
  await wait(2200);
  const playing = await read();
  expect(playing.music?.queued === true, "播放列表后引擎应处于队列模式");
  expect(
    playing.music?.files?.length === library,
    `队列应等于列表长度 ${library}，实际 ${playing.music?.files?.length}`,
  );
  expect(playing.music?.playing === true, "播放列表后应处于播放态");
  expect(
    playingKey(playing) === "atmosphere",
    `应从第一首开始播，实际 ${playingKey(playing)}`,
  );
  expect(playing.items[0]?.playing === true, "正在播放的列表应带播放标记");
  await shot("playing-list");
  await step("playing-list", playing);
  report.checks.push("playing a list switches the engine to that queue and starts at its first track");

  // 5. 行内播放第二首：队列下标与顺序一致。
  const secondKey = playing.music?.files?.[1] ?? "";
  await clickListAction("playlist-track-play", secondKey);
  const second = await read();
  expect(
    playingKey(second) === secondKey,
    `行内播放应切到第二首，实际 ${playingKey(second)}`,
  );
  expect(second.music?.wanted === 1, `播放目标应为队列下标 1，实际 ${second.music?.wanted}`);
  report.checks.push("per-row play maps to the queue index");

  // 6. 排序：上移第二首，队列顺序跟着变。
  await clickListAction("playlist-move", secondKey);
  const reordered = await read();
  expect(
    reordered.playlists?.lists?.[0]?.tracks?.[0] === secondKey,
    `上移后列表首位应是 ${secondKey}，实际 ${reordered.playlists?.lists?.[0]?.tracks?.[0]}`,
  );
  expect(reordered.music?.files?.[0] === secondKey, "引擎队列顺序应跟随列表排序");
  await shot("reordered");
  await step("reordered", reordered);
  report.checks.push("reordering the list reorders the live queue");

  // 7. 移除正在播放的那一首：队列少一首，播放顺延。
  await clickListAction("playlist-remove", secondKey);
  const removed = await read();
  expect(
    removed.playlists?.lists?.[0]?.tracks?.length === library - 1,
    `移除后列表应剩 ${library - 1} 首，实际 ${removed.playlists?.lists?.[0]?.tracks?.length}`,
  );
  expect(removed.music?.queued === true, "移除后仍应在队列模式");
  expect(
    removed.music?.files?.length === library - 1,
    `队列应剩 ${library - 1} 首，实际 ${removed.music?.files?.length}`,
  );
  expect(removed.music?.playing === true, "移除正在播放的曲目后应继续播放队列里的下一条");
  await shot("removed");
  await step("removed", removed);
  report.checks.push("removing the playing track keeps playback going on the remaining queue");

  // 8. 删除列表：队列退出，回到整个曲库。
  await page.click('[data-action="playlist-delete"]');
  await wait(500);
  await page.click('[data-action="playlist-delete-confirm"]');
  await wait(1500);
  const deleted = await read();
  expect(deleted.playlists?.lists?.length === 0, "删除后不应残留列表");
  expect(deleted.playlists?.active === null, "列表删除后应退出队列");
  expect(deleted.music?.queued === false, "列表删除后引擎应回到整个曲库");
  expect(
    (deleted.music?.files?.length ?? 0) === library,
    `回到整个曲库后应恢复 ${library} 首`,
  );
  await shot("deleted");
  await step("deleted", deleted);
  report.checks.push("deleting the active list leaves the queue and returns to the whole library");

  // 9. 失效项：指向已不存在的曲目时，界面标注、引擎跳过。
  await page.evaluate(() => {
    localStorage.setItem(
      "rhine-playlists",
      JSON.stringify([
        {
          id: "pl-seed",
          name: "Seed",
          createdAt: 1,
          tracks: ["local:missingentry", "atmosphere"],
        },
      ]),
    );
  });
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("#stage")?.dataset.boot === "done",
    { timeout: 60000 },
  );
  await wait(1800);
  await openPlaylists();
  const seeded = await read();
  expect(seeded.playlists?.lists?.length === 1, "刷新后应从存储里读回列表");
  expect(seeded.rows.length === 2, `列表应有 2 行（含 1 条失效），实际 ${seeded.rows.length}`);
  expect(
    seeded.rows.filter((row) => row.missing).length === 1,
    `应有 1 行标注失效，实际 ${seeded.rows.filter((row) => row.missing).length}`,
  );
  expect(seeded.music?.queued === false, "刷新后队列不应还在（播放队列不持久化）");
  await shot("missing-entry");
  await step("missing-entry", seeded);
  report.checks.push("a dangling entry is marked missing and does not survive into the queue");

  await page.click('[data-action="playlist-play"]');
  await wait(2000);
  const seededPlaying = await read();
  expect(
    seededPlaying.music?.queued === true && seededPlaying.music?.files?.length === 1,
    `播放时应跳过失效项，实际队列 ${seededPlaying.music?.files?.length} 首`,
  );
  await step("missing-playing", seededPlaying);
  report.checks.push("playing a list with a dangling entry queues only the resolvable tracks");

  // 10. 刷新持久化：列表内容留在 localStorage。
  const persisted = await page.evaluate(() => localStorage.getItem("rhine-playlists"));
  expect(
    typeof persisted === "string" && persisted.includes("pl-seed"),
    "列表应持久化到 localStorage",
  );
  report.checks.push("playlists persist in localStorage across reloads");

  expect(errors.length === 0, `页面不应报错，实际 ${JSON.stringify(errors.slice(0, 3))}`);
} catch (error) {
  failures.push(`检查过程抛出异常：${error instanceof Error ? error.message : String(error)}`);
} finally {
  writeFileSync(
    `${out}/playlists-report.json`,
    JSON.stringify({ ...report, passed: failures.length === 0 }, null, 2),
  );
  await browser.close();
}

if (failures.length) {
  console.error("播放列表检查未通过：");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`播放列表检查通过：${report.checks.length} 项断言全部成立`);
for (const check of report.checks) console.log(` - ${check}`);
