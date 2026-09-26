// 本地曲目接入五列阵列的检查：槽位继承、详情、播放、检索、删除回退、超限拒绝与持久化。
// 需要本机 dev server（默认 http://127.0.0.1:5173）与系统 Edge。
//   node scripts/check-local-array.mjs
//   CHECK_URL=http://127.0.0.1:5190 node scripts/check-local-array.mjs
// 环境变量：CHECK_URL、EDGE_PATH、CHECK_OUT（证据目录，缺省 verification/local-array）。
// 测试音频由脚本自己生成（35 个合法 WAV），不依赖手工准备。
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = `${process.env.CHECK_URL ?? "http://127.0.0.1:5173"}/?scene=archive`;
const edge =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = resolve(process.env.CHECK_OUT ?? "verification/local-array");
const temp = resolve(".cowork-temp/check-local-array");
mkdirSync(out, { recursive: true });
mkdirSync(temp, { recursive: true });

/** 16-bit PCM 单声道 WAV，够小且一定能解码。 */
function wavBuffer(seconds = 1.5, sampleRate = 8000, frequency = 440) {
  const frames = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++)
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 12000),
      i * 2,
    );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const fixture = (name, seconds, frequency) => {
  const path = resolve(temp, name);
  writeFileSync(path, wavBuffer(seconds, 8000, frequency));
  return { name, path };
};

// 前两个覆盖短横线与长破折号两种分隔符；其余用来填满 34 个占位槽。
// 时长取 15 秒以上：测试窗口内不会自己播完跳到下一首，否则「删除正在播放的曲目」
// 之后的断言会被列表自动循环带偏。
const first = fixture("Alpha Artist - First Song.wav", 25, 440);
const second = fixture("Beta Artist – Second Song.wav", 30, 523);
const bulk = Array.from({ length: 33 }, (_, i) =>
  fixture(
    `Bulk Artist - Bulk Track ${String(i + 1).padStart(2, "0")}.wav`,
    15,
    300 + i,
  ),
);
const overflow = fixture("Overflow Artist - Overflow Song.wav", 15, 700);

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
    // 检查脚本不经过页面内的解锁链路，因此允许无手势起播。
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
    const stats = window.rhine?.stats?.() ?? {};
    const library = stats.library ?? { slots: [], entries: [], used: 0, capacity: 0 };
    const slot = (index) => library.slots.find((item) => item.index === index) ?? null;
    return {
      mode: stats.mode ?? "",
      selected: stats.selected ?? "",
      code: document.querySelector("#selected-code")?.textContent?.trim() ?? "",
      title: document.querySelector("#selected-title")?.textContent?.trim() ?? "",
      clearance: document.querySelector("#selected-clearance")?.textContent?.trim() ?? "",
      category: document.querySelector("#archive-category")?.textContent?.trim() ?? "",
      heading: document.querySelector("#detail-content h2")?.textContent?.trim() ?? "",
      detailArtist:
        document.querySelector("#detail-content .detail-title-cn")?.textContent?.trim() ?? "",
      detailMeta: [...document.querySelectorAll("#detail-content .metadata div")].map(
        (row) =>
          `${row.querySelector("dt")?.textContent?.trim() ?? ""}=${row
            .querySelector("dd")
            ?.textContent?.trim() ?? ""}`,
      ),
      detailLocal: document.querySelector("#playback-local")?.textContent?.trim() ?? "",
      detailLocalHidden: document.querySelector("#playback-local")?.hidden ?? null,
      status: document.querySelector("#local-library .local-status")?.textContent?.trim() ?? "",
      usage: document.querySelector("#local-library .local-usage")?.textContent?.trim() ?? "",
      rows: document.querySelectorAll("#local-library .local-row").length,
      resultRows: [...document.querySelectorAll("#search-results .result-row")].map(
        (row) =>
          `${row.dataset.result}:${row.textContent?.replace(/\s+/g, " ").trim() ?? ""}`,
      ),
      music: window.rhineMusicState?.() ?? null,
      library: {
        used: library.used,
        capacity: library.capacity,
        remaining: library.remaining,
        filled: library.slots.filter((item) => item.localId).map((item) => item.index),
        entries: library.entries.map((entry) => `${entry.slot}:${entry.title}:${entry.id}`),
        slot4: slot(4),
        slot5: slot(5),
        slotLast: slot(39),
        overflow: library.slots.some((item) => item.title === "Overflow Song"),
      },
    };
  });

const playingFile = (state) =>
  state.music && state.music.track >= 0
    ? state.music.tracks[state.music.track]?.file ?? ""
    : "";

let shotIndex = 0;
const shot = async (name) => {
  shotIndex++;
  const file = `check-${String(shotIndex).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: `${out}/${file}` });
  report.shots.push(file);
};
const step = async (name) => {
  report.steps[name] = await read();
};

const boot = async () => {
  await page.waitForFunction(
    () => document.querySelector("#stage")?.dataset.boot === "done",
    { timeout: 60000 },
  );
  await wait(1500);
};
const openSettings = async () => {
  await page.click('[data-action="settings"]');
  await page.waitForSelector("#local-library", { timeout: 20000 });
  await wait(700);
};
const closeSettings = async () => {
  if (!(await page.$(".modal-backdrop"))) return;
  await page.click('[data-action="close-modal"]');
  await page.waitForFunction(() => !document.querySelector(".modal-backdrop"), {
    timeout: 10000,
  });
  await wait(500);
};
const upload = async (paths) => {
  const input = await page.$("#local-import");
  expect(Boolean(input), "设置面板里没有 #local-import 文件选择器");
  if (!input) return;
  await input.uploadFile(...paths);
};
/** 确定让某条本地曲目在播：已经播着同一首时不重复点击（再点会变成暂停）。 */
const startPlayback = async (id) => {
  for (const attempt of [0, 1]) {
    const state = await read();
    if (playingFile(state) === `local:${id}` && state.music?.playing) return;
    const row = await page.$(`#local-library .local-row[data-local-id="${id}"]`);
    expect(Boolean(row), `设置面板里找不到本地曲目 ${id} 的行`);
    if (!row) return;
    await row.$eval('[data-local-action="play"]', (button) => button.click());
    await wait(1800);
  }
};

const report = {
  url,
  checks: [],
  shots: [],
  steps: {},
  failures,
  errors,
};

try {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await boot();
  const empty = await read();
  expect(
    empty.library.capacity === 34,
    `占位槽总数应为 34，实际 ${empty.library.capacity}`,
  );
  // 占位槽被本地曲目顶掉后应回退到的原数据（曲名与状态）。
  const placeholder5 = empty.library.slot5;
  const placeholder4 = empty.library.slot4;

  // 1. 导入两首：落在 records 顺序里的第一个、第二个空占位槽。
  await openSettings();
  const firstId = first.name;
  await upload([first.path, second.path]);
  await page.waitForFunction(
    () => (window.rhine?.stats?.().library?.used ?? 0) === 2,
    { timeout: 30000 },
  );
  await wait(900);
  const imported = await read();
  const id1 = imported.library.slot4?.localId ?? "";
  const id2 = imported.library.slot5?.localId ?? "";
  expect(imported.library.filled.join(",") === "4,5", `占位槽应依次填 4、5，实际 ${imported.library.filled.join(",")}`);
  expect(
    imported.library.slot4?.id === "RM-005" &&
      imported.library.slot4?.pending === false &&
      imported.library.slot4?.category === "观测室",
    `RM-005 应沿用原槽位（编号与列不变）并变为可播放，实际 ${JSON.stringify(imported.library.slot4)}`,
  );
  expect(
    imported.library.slot4?.title === "First Song" &&
      imported.library.slot4?.artist === "Alpha Artist",
    `RM-005 应换成导入文件的曲名与歌手，实际 ${imported.library.slot4?.title} / ${imported.library.slot4?.artist}`,
  );
  expect(
    Math.round(imported.library.slot4?.duration ?? 0) === 25,
    `RM-005 时长应为真实解码时长 25，实际 ${imported.library.slot4?.duration}`,
  );
  expect(
    imported.library.slot4?.file === `local:${id1}` && id1,
    `RM-005 的 file 应为 local:<id>，实际 ${imported.library.slot4?.file}`,
  );
  expect(
    imported.library.slot5?.id === "RM-006" &&
      imported.library.slot5?.title === "Second Song" &&
      imported.library.slot5?.pending === false,
    `RM-006 应填第二首，实际 ${imported.library.slot5?.title}`,
  );
  expect(
    imported.usage.includes("2 / 34"),
    `设置面板应显示「2 / 34 已使用」，实际 ${imported.usage}`,
  );
  await shot("slots-filled");
  await step("slots-filled", imported);
  report.checks.push("imported tracks fill the first free slots in records order and inherit id/column");

  // 2. 刷新后填充关系不变（占位槽随条目持久保存）。
  await closeSettings();
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await boot();
  const reloaded = await read();
  expect(
    reloaded.library.slot4?.localId === id1 && reloaded.library.slot5?.localId === id2,
    `刷新后填充关系应保持不变，实际 ${reloaded.library.slot4?.localId} / ${reloaded.library.slot5?.localId}`,
  );
  expect(reloaded.library.used === 2, `刷新后占用应为 2，实际 ${reloaded.library.used}`);
  await step("after-reload", reloaded);
  report.checks.push("slot assignment persists across reload");

  // 3. 库检索能命中导入的曲目。
  await page.click('[data-action="search"]');
  await page.waitForSelector("#archive-search", { timeout: 20000 });
  await page.type("#archive-search", "First Song");
  await wait(700);
  const searched = await read();
  expect(
    searched.resultRows.some((row) => row.includes("RM-005") && row.includes("READY")),
    `库检索应命中 RM-005 且状态为 READY，实际 ${searched.resultRows.join(" | ")}`,
  );
  await shot("search-hit");
  await closeSettings();
  report.checks.push("the filled slot is searchable in the track index");

  // 4. 该方块可被选中并抽取进详情：曲名、歌手、时长来自导入文件。
  await page.evaluate(() => window.rhine.select(4));
  await wait(900);
  const selected = await read();
  expect(selected.code.includes("005"), `应选中 RM-005，实际 ${selected.code}`);
  expect(selected.title === "First Song", `卡片标题应为 First Song，实际 ${selected.title}`);
  expect(selected.clearance === "READY", `卡片状态应为 READY，实际 ${selected.clearance}`);
  expect(selected.category === "观测室", `列归属应保持观测室，实际 ${selected.category}`);
  await shot("slot-selected");

  await page.click(".read-file");
  await wait(1800);
  const detail = await read();
  expect(detail.mode === "detail", `应进入详情，实际 ${detail.mode}`);
  expect(detail.heading === "First Song", `详情标题应为 First Song，实际 ${detail.heading}`);
  expect(
    detail.detailArtist.includes("Alpha Artist"),
    `详情歌手应为 Alpha Artist，实际 ${detail.detailArtist}`,
  );
  expect(
    detail.detailMeta.some((row) => row.startsWith("DURATION") && row.endsWith("00:25")),
    `详情时长应为 00:25，实际 ${detail.detailMeta.join(" | ")}`,
  );
  expect(
    detail.detailMeta.some((row) => row.includes("LOCAL LIBRARY")),
    `详情来源应标明本地曲库，实际 ${detail.detailMeta.join(" | ")}`,
  );
  expect(
    detail.detailLocalHidden === false && detail.detailLocal.includes("LOCAL LIBRARY"),
    `详情走带下方应标注本地曲目，实际 hidden=${detail.detailLocalHidden} ${detail.detailLocal}`,
  );
  await shot("detail-local-slot");
  await step("detail", detail);
  report.checks.push("the filled slot can be raised into the detail panel with its real title/artist/duration");

  // 5. 播放走本地音源。
  await page.waitForFunction(
    () => window.rhineMusicState?.()?.playing === true,
    { timeout: 20000 },
  );
  const playing = await read();
  expect(
    playingFile(playing) === `local:${id1}`,
    `播放应走本地音源 local:${id1}，实际 ${playingFile(playing)}`,
  );
  await page.click('[data-action="play-track"]');
  await wait(900);
  const paused = await read();
  expect(paused.music?.playing === false, `再次点击应暂停，实际 ${paused.music?.playing}`);
  await page.click('[data-action="play-track"]');
  await wait(1400);
  const resumed = await read();
  expect(
    resumed.music?.playing === true && playingFile(resumed) === `local:${id1}`,
    `恢复播放应仍是该本地音源，实际 ${playingFile(resumed)} / ${resumed.music?.playing}`,
  );
  await shot("plays-local-source");
  report.checks.push("playback from the array slot uses the imported local source");

  // 6. 删除非播放中的曲目：该槽位回到占位，编号与占位曲名还原，选择与播放不受影响。
  await page.keyboard.press("Escape");
  await wait(1200);
  await openSettings();
  const rowsBefore = await read();
  await page.evaluate((id) => {
    const row = document.querySelector(`#local-library .local-row[data-local-id="${id}"]`);
    row?.querySelector('[data-local-action="delete"]')?.click();
  }, id2);
  await wait(600);
  await page.click('#local-library [data-local-action="delete-confirm"]');
  await page.waitForFunction(
    () => (window.rhine?.stats?.().library?.used ?? 0) === 1,
    { timeout: 20000 },
  );
  await wait(1600);
  const afterDelete = await read();
  expect(
    afterDelete.library.slot5?.pending === true &&
      afterDelete.library.slot5?.id === placeholder5?.id &&
      afterDelete.library.slot5?.title === placeholder5?.title &&
      afterDelete.library.slot5?.file === null &&
      afterDelete.library.slot5?.localId === null,
    `删除后 ${placeholder5?.id} 应回到原占位数据 ${placeholder5?.title}，实际 ${JSON.stringify(afterDelete.library.slot5)}`,
  );
  expect(
    afterDelete.selected === "RM-005",
    `删除别的曲目不得回退阵列选择，实际 ${afterDelete.selected}（删除前 ${rowsBefore.selected}）`,
  );
  expect(
    playingFile(afterDelete) === `local:${id1}` && afterDelete.music?.playing === true,
    `删除别的曲目不得打断播放，实际 ${playingFile(afterDelete)} / ${afterDelete.music?.playing}`,
  );
  expect(
    afterDelete.usage.includes("1 / 34"),
    `设置面板应显示「1 / 34 已使用」，实际 ${afterDelete.usage}`,
  );
  await shot("slot-restored");
  await step("slot-restored", afterDelete);
  report.checks.push("deleting a local track restores its slot to the original placeholder");

  // 7. 填满 34 个占位槽：重新导入的曲目先占用刚释放的 RM-006。
  await upload(bulk.map((item) => item.path));
  await page.waitForFunction(
    () => (window.rhine?.stats?.().library?.used ?? 0) === 34,
    { timeout: 120000 },
  );
  await wait(1200);
  const full = await read();
  expect(full.library.filled.length === 34, `占满后应有 34 个槽被填充，实际 ${full.library.filled.length}`);
  expect(
    full.library.slot5?.title === "Bulk Track 01",
    `刚释放的 RM-006 应被下一首导入曲目占用，实际 ${full.library.slot5?.title}`,
  );
  expect(
    full.library.slotLast?.id === "RM-040" && full.library.slotLast?.pending === false,
    `最后一个占位槽 RM-040 应被填充，实际 ${JSON.stringify(full.library.slotLast)}`,
  );
  expect(full.library.remaining === 0, `剩余槽数应为 0，实际 ${full.library.remaining}`);
  expect(
    full.usage.includes("已用尽"),
    `占位槽用尽时设置面板应说明，实际 ${full.usage}`,
  );
  expect(full.rows === 34, `列表应有 34 行，实际 ${full.rows}`);
  await shot("slots-full");
  await step("slots-full", full);
  report.checks.push("thirty-four imports fill every placeholder slot in order");

  // 8. 再导入：被拒绝，不写入 IndexedDB、不占位。
  await upload([overflow.path]);
  await wait(2200);
  const rejected = await read();
  expect(rejected.library.used === 34, `超限导入不得占位，实际 ${rejected.library.used}`);
  expect(rejected.rows === 34, `超限导入不得进入列表，实际 ${rejected.rows} 行`);
  expect(
    rejected.status.includes("用尽") && rejected.status.includes("Overflow Song.wav"),
    `超限导入应给出可读提示，实际 ${rejected.status}`,
  );
  await shot("over-limit-rejected");
  await step("over-limit-rejected", rejected);
  report.checks.push("imports beyond the placeholder slots are refused with a readable message");

  // 9. 刷新：34 个占用仍在，被拒绝的文件也没有落库。
  await closeSettings();
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await boot();
  const persisted = await read();
  expect(persisted.library.used === 34, `刷新后占用应仍为 34，实际 ${persisted.library.used}`);
  expect(
    persisted.library.overflow === false,
    "被拒绝的文件不得出现在曲库或阵列里",
  );
  expect(
    persisted.library.slot4?.localId === id1 && persisted.library.slotLast?.pending === false,
    "刷新后填充关系应完全保持",
  );
  await step("after-reload-full", persisted);
  report.checks.push("the full 34-slot assignment persists and the refused file is never stored");

  // 10. 删除正在播放的曲目：槽位回到占位，播放顺延到下一首，选择向前跟随不回退。
  await openSettings();
  await startPlayback(id1);
  const playingFirst = await read();
  expect(
    playingFile(playingFirst) === `local:${id1}` && playingFirst.music?.playing === true,
    `应开始播放 RM-005 的本地曲目，实际 ${playingFile(playingFirst)}`,
  );
  expect(
    playingFirst.selected === "RM-005",
    `播放本地曲目时阵列应跟随到它所在的方块，实际 ${playingFirst.selected}`,
  );
  await page.evaluate((id) => {
    document
      .querySelector(`#local-library .local-row[data-local-id="${id}"] [data-local-action="delete"]`)
      ?.click();
  }, id1);
  await wait(600);
  await page.click('#local-library [data-local-action="delete-confirm"]');
  await wait(1800);
  const afterPlayingDelete = await read();
  expect(
    afterPlayingDelete.library.slot4?.pending === true &&
      afterPlayingDelete.library.slot4?.id === placeholder4?.id &&
      afterPlayingDelete.library.slot4?.title === placeholder4?.title,
    `删除后 ${placeholder4?.id} 应回到原占位曲目 ${placeholder4?.title}，实际 ${JSON.stringify(afterPlayingDelete.library.slot4)}`,
  );
  expect(
    playingFile(afterPlayingDelete) !== `local:${id1}` &&
      playingFile(afterPlayingDelete).startsWith("local:") &&
      afterPlayingDelete.music?.playing === true,
    `删除正在播放的曲目应顺延到下一条本地曲目，实际 ${playingFile(afterPlayingDelete)}`,
  );
  expect(
    afterPlayingDelete.selected === "RM-006",
    `播放顺延后阵列应向前跟随而不是回退，实际 ${afterPlayingDelete.selected}`,
  );
  await shot("playing-deleted");
  await step("playing-deleted", afterPlayingDelete);
  report.checks.push("deleting the playing track restores its slot and advances playback forward");

  expect(errors.length === 0, `页面报错：${errors.join(" | ")}`);
} catch (error) {
  failures.push(`检查过程出错：${error instanceof Error ? error.message : String(error)}`);
} finally {
  report.passed = failures.length === 0;
  report.failures = failures;
  report.errors = errors;
  writeFileSync(`${out}/local-array-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

if (failures.length) {
  console.error(`本地曲目阵列检查失败：\n- ${failures.join("\n- ")}`);
  console.error(`证据：${out}`);
  process.exit(1);
}
console.log(
  `本地曲目阵列检查通过：槽位继承、详情、播放、检索、删除回退、超限拒绝与持久化均符合文档。证据见 ${out}。`,
);
