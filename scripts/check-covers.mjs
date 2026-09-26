// 内嵌封面检查：导入带封面的音频后，选中卡片的右半区画出封面；无封面曲目留空。
// 需要本机 dev server（默认 http://127.0.0.1:5173）与系统 Edge。
//   node scripts/check-covers.mjs
//   CHECK_URL=http://127.0.0.1:5190 node scripts/check-covers.mjs
// 环境变量：CHECK_URL、EDGE_PATH、CHECK_OUT（证据目录，缺省 verification/covers）。
// 测试文件由脚本自己生成：一个带 ID3v2 APIC 封面的 mp3，一个没有封面字段的 WAV。
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = `${process.env.CHECK_URL ?? "http://127.0.0.1:5173"}/?scene=archive`;
const edge =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = resolve(process.env.CHECK_OUT ?? "verification/covers");
const temp = resolve(".cowork-temp/check-covers");
mkdirSync(out, { recursive: true });
mkdirSync(temp, { recursive: true });

/** 48 × 48 PNG（脚本生成，避免引入图片依赖）。 */
const PNG_BASE64 =
  "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";

/** ID3v2.3 标签 + 一个 APIC 帧（front cover，PNG）。 */
function id3WithCover(png) {
  const body = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from("image/png\0", "latin1"),
    Buffer.from([0x03]),
    Buffer.from("\0", "latin1"),
    png,
  ]);
  const frame = Buffer.concat([Buffer.from("APIC", "latin1"), Buffer.alloc(6), body]);
  frame.writeUInt32BE(body.length, 4);
  const header = Buffer.alloc(10);
  header.write("ID3", 0, "latin1");
  header[3] = 3;
  const size = frame.length;
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  return Buffer.concat([header, frame]);
}

/** 去掉文件开头已有的 ID3v2 标签，只留 MPEG 音频帧。 */
function stripId3(buffer) {
  if (buffer.length < 10 || buffer.toString("latin1", 0, 3) !== "ID3") return buffer;
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  return buffer.subarray(10 + size);
}

/** 16-bit PCM 单声道 WAV，够小且一定能解码，且没有封面字段。 */
function wavBuffer(seconds = 25, sampleRate = 8000, frequency = 440) {
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

// 带封面的 mp3：自造 ID3v2(APIC) + 仓库里真实 mp3 的音频帧，保证浏览器能解码。
const donor = readFileSync(resolve("public/audio/observatory-preview.mp3"));
const coverMp3 = Buffer.concat([id3WithCover(Buffer.from(PNG_BASE64, "base64")), stripId3(donor)]);
const fixtures = [
  { name: "Cover Artist - Cover Song.mp3", buffer: coverMp3 },
  { name: "Plain Artist - No Cover Song.wav", buffer: wavBuffer() },
].map(({ name, buffer }) => {
  const path = resolve(temp, name);
  writeFileSync(path, buffer);
  return { name, path };
});

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
      rows: [...document.querySelectorAll("#local-library .local-row")].map((element) => ({
        id: element.dataset.localId ?? "",
        title: element.querySelector(".local-name b")?.textContent?.trim() ?? "",
        meta: element.querySelector(".local-name small")?.textContent?.trim() ?? "",
        time: element.querySelector(".local-time")?.textContent?.trim() ?? "",
      })),
      status: document.querySelector("#local-library .local-status")?.textContent?.trim() ?? "",
      label: stats?.label ?? null,
      slots: (stats?.library?.slots ?? []).map((slot) => ({
        id: slot.id,
        cover: slot.cover,
        localId: slot.localId,
        pending: slot.pending,
      })),
      entries: stats?.library?.entries ?? [],
      selected: stats?.selected ?? "",
      mode: stats?.mode ?? "",
      music,
    };
  });

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
/** 清掉上一轮留下的截图，避免新旧编号混在一起。 */
const clearEvidence = () => {
  for (const file of readdirSync(out))
    if (/^check-\d+.*\.png$/.test(file)) rmSync(`${out}/${file}`, { force: true });
  report.shots = [];
  shotIndex = 0;
};

const openSettings = async () => {
  await page.click('[data-action="settings"]');
  await page.waitForSelector("#local-library", { timeout: 20000 });
  await wait(700);
};
const closeSettings = async () => {
  if (!(await page.$(".modal-backdrop"))) return;
  await page.click('[data-action="close-modal"]');
  await page.waitForFunction(() => !document.querySelector(".modal-backdrop"), { timeout: 10000 });
  await wait(500);
};
const upload = async (fixture) => {
  const input = await page.$("#local-import");
  expect(Boolean(input), "设置面板里没有 #local-import 文件选择器");
  if (!input) return;
  await input.uploadFile(fixture.path);
  await wait(1500);
};
/** 播放列表里某一行的播放按钮（按行号）。 */
const playRow = async (index) => {
  const rows = await page.$$("#local-library .local-row");
  const button = await rows[index]?.$('[data-local-action="play"]');
  expect(Boolean(button), `第 ${index + 1} 行没有播放按钮`);
  if (button) await button.click();
  await wait(1500);
};

const report = {
  url,
  fixtures: fixtures.map((fixture) => fixture.name),
  checks: [],
  shots: [],
  steps: {},
  failures,
  errors,
};

try {
  clearEvidence();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#stage")?.dataset.boot === "done", {
    timeout: 60000,
  });
  await wait(1500);

  // 1. 导入带内嵌封面的 mp3：行、时长、数据层封面标记。
  await openSettings();
  await upload(fixtures[0]);
  const imported = await read();
  expect(imported.rows.length === 1, `导入 1 个文件后应有 1 行，实际 ${imported.rows.length}`);
  expect(
    imported.rows[0]?.title === "Cover Song" && imported.rows[0]?.meta.includes("Cover Artist"),
    `文件名应解析出 Cover Song / Cover Artist，实际 ${imported.rows[0]?.title} / ${imported.rows[0]?.meta}`,
  );
  expect(
    imported.entries[0]?.cover === true,
    "带内嵌封面的曲目在曲库数据层应标记 cover=true",
  );
  const coverRowId = imported.rows[0]?.id ?? "";
  const coverSlot = imported.slots.find((slot) => slot.localId === coverRowId)?.id ?? "";
  expect(Boolean(coverSlot), `封面曲目应占用一个阵列方块（RM-0xx），实际 ${coverSlot}`);
  expect(
    imported.slots.some((slot) => slot.cover === true && slot.localId === coverRowId),
    "覆盖后的占位槽应带有封面标记",
  );
  await shot("imported-cover-song");
  await step("imported-cover-song", imported);
  report.checks.push("importing a track with embedded APIC marks cover=true in the library data");

  // 2. 导入无封面 WAV，确认不会误报有封面。
  await upload(fixtures[1]);
  const twoRows = await read();
  expect(twoRows.rows.length === 2, `再导入 1 个文件后应有 2 行，实际 ${twoRows.rows.length}`);
  expect(
    twoRows.entries[1]?.cover === false,
    "没有内嵌封面的曲目在数据层应标记 cover=false",
  );
  await step("two-rows", twoRows);
  report.checks.push("a track without embedded art reports cover=false");

  // 3. 播放带封面的曲目：阵列跟随到它的方块，卡片正面右半区画出封面。
  await playRow(0);
  const playingCover = await read();
  expect(
    playingCover.music?.playing === true,
    `播放带封面曲目后应处于播放态，实际 ${JSON.stringify(playingCover.music?.playing)}`,
  );
  expect(
    playingCover.selected === coverSlot,
    `播放后阵列应跟随到封面曲目占用的方块 ${coverSlot}，实际 ${playingCover.selected}`,
  );
  await page
    .waitForFunction(() => window.rhine?.stats?.().label?.cover === "ready", { timeout: 10000 })
    .catch(() => {});
  const coverReady = await read();
  expect(
    coverReady.label?.cover === "ready",
    `选中带封面的曲目后卡片印刷面应画出封面，实际 ${coverReady.label?.cover}`,
  );
  await shot("cover-on-card");
  await step("cover-on-card", coverReady);
  report.checks.push("selecting a covered track draws the cover on the card face (label.cover=ready)");

  // 3b. 合上设置，看阵列里的选中卡片：封面应印在正面右半区。
  await closeSettings();
  await wait(1800);
  await shot("archive-cover-selected");
  await page.click(".read-file");
  await wait(2600);
  const detail = await read();
  expect(detail.mode === "detail", `应能进入详情面板，实际 ${detail.mode}`);
  await shot("detail-cover-card");
  report.checks.push("detail view renders the printed face with the embedded cover");
  await page.keyboard.press("Escape");
  await wait(1500);

  // 4. 播放无封面曲目：右半区留空（label.cover=none）。
  await openSettings();
  const plainRowId = twoRows.rows[1]?.id ?? "";
  const plainSlot = twoRows.slots.find((slot) => slot.localId === plainRowId)?.id ?? "";
  await playRow(1);
  await page
    .waitForFunction(() => window.rhine?.stats?.().label?.cover === "none", { timeout: 10000 })
    .catch(() => {});
  const plain = await read();
  expect(
    plain.selected === plainSlot && plainSlot !== coverSlot,
    `播放无封面曲目后阵列应跟随到 ${plainSlot}（且不同于封面曲目 ${coverSlot}），实际 ${plain.selected}`,
  );
  expect(
    plain.label?.cover === "none",
    `选中无封面曲目时卡片印刷面应留空，实际 ${plain.label?.cover}`,
  );
  await shot("no-cover-on-card");
  await step("no-cover-on-card", plain);
  report.checks.push("selecting a track without art leaves the right half blank (label.cover=none)");
  await closeSettings();
  await wait(1800);
  await shot("archive-no-cover-selected");
  await page.click(".read-file");
  await wait(2600);
  if ((await read()).mode === "detail") await shot("detail-no-cover-card");
  await page.keyboard.press("Escape");
  await wait(1200);

  // 6. 刷新后封面仍在（IndexedDB 持久化 + 重新解析同一 object URL）。
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => document.querySelector("#stage")?.dataset.boot === "done", {
    timeout: 60000,
  });
  await wait(1800);
  const reloaded = await read();
  expect(
    reloaded.entries.filter((entry) => entry.cover).length === 1,
    `刷新后应仍有一条带封面的本地曲目，实际 ${reloaded.entries.filter((entry) => entry.cover).length}`,
  );
  await step("after-reload", reloaded);
  report.checks.push("embedded covers persist across reload");

  expect(errors.length === 0, `页面不应报错，实际 ${JSON.stringify(errors.slice(0, 3))}`);
} catch (error) {
  failures.push(`检查过程抛出异常：${error instanceof Error ? error.message : String(error)}`);
} finally {
  writeFileSync(
    `${out}/covers-report.json`,
    JSON.stringify({ ...report, passed: failures.length === 0 }, null, 2),
  );
  await browser.close();
}

if (failures.length) {
  console.error("封面检查未通过：");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`封面检查通过：${report.checks.length} 项断言全部成立`);
for (const check of report.checks) console.log(` - ${check}`);
