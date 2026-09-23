// 本地曲库检查：导入、持久化、播放、编辑、删除与索引重映射。
// 需要本机 dev server（默认 http://127.0.0.1:5173）与系统 Edge。
//   node scripts/check-local-imports.mjs
//   CHECK_URL=http://127.0.0.1:5190 node scripts/check-local-imports.mjs
// 环境变量：CHECK_URL、EDGE_PATH、CHECK_OUT（证据目录，缺省 verification/local-imports）。
// 测试音频由脚本自己生成（两个合法 WAV + 一个损坏文件），不依赖手工准备。
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = `${process.env.CHECK_URL ?? "http://127.0.0.1:5173"}/?scene=archive`;
const edge =
  process.env.EDGE_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const out = resolve(process.env.CHECK_OUT ?? "verification/local-imports");
const temp = resolve(".cowork-temp/check-local-imports");
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

// 短横线与长破折号两种分隔符都要覆盖；第三个文件是损坏的假音频。
// 时长取 20 秒以上：太短的音频在检查过程中自己播完会跳过下一首，干扰索引断言。
const fixtures = [
  { name: "Alpha Artist - First Song.wav", buffer: wavBuffer(25, 8000, 440) },
  { name: "Beta Artist – Second Song.wav", buffer: wavBuffer(30, 8000, 523) },
  { name: "Broken Upload.mp3", buffer: Buffer.from("this is not audio at all", "utf8") },
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
    const music = window.rhineMusicState?.() ?? null;
    return {
      rows: [...document.querySelectorAll("#local-library .local-row")].map((element) => ({
        id: element.dataset.localId ?? "",
        title: element.querySelector(".local-name b")?.textContent?.trim() ?? "",
        meta: element.querySelector(".local-name small")?.textContent?.trim() ?? "",
        time: element.querySelector(".local-time")?.textContent?.trim() ?? "",
        editing: element.classList.contains("local-row--edit"),
        playing: element.classList.contains("playing"),
        play: element.querySelector('[data-local-action="play"]')?.textContent?.trim() ?? "",
      })),
      status: document.querySelector("#local-library .local-status")?.textContent?.trim() ?? "",
      statusKind: document.querySelector("#local-library .local-status")?.dataset.kind ?? "",
      empty: Boolean(document.querySelector("#local-library .local-empty")),
      playerTitle: document.querySelector(".music-player .player-title")?.textContent?.trim() ?? "",
      detailLocal: document.querySelector("#playback-local")?.textContent?.trim() ?? "",
      detailLocalHidden: document.querySelector("#playback-local")?.hidden ?? null,
      mode: window.rhine?.stats?.().mode ?? "",
      selected: window.rhine?.stats?.().selected ?? "",
      music,
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
const upload = async (fixture) => {
  const input = await page.$("#local-import");
  expect(Boolean(input), "设置面板里没有 #local-import 文件选择器");
  if (!input) return;
  await input.uploadFile(fixture.path);
  await wait(1400);
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
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("#stage")?.dataset.boot === "done",
    { timeout: 60000 },
  );
  await wait(1500);

  // 1. 先让一条内置曲目播起来，用来验证「导入不打断当前播放」。
  await page.keyboard.press("ArrowDown");
  await wait(2200);
  const before = await read();
  expect(
    before.music?.playing === true,
    `导入前应有一条曲目在播放，实际 ${JSON.stringify(before.music?.playing)}`,
  );
  const beforeTrack = before.music?.track ?? -1;
  const beforeSelected = before.selected;

  // 2. 导入：本地曲目进入列表，播放不受影响。
  await openSettings();
  await upload(fixtures[0]);
  const first = await read();
  expect(first.rows.length === 1, `导入 1 个文件后列表应有 1 行，实际 ${first.rows.length}`);
  expect(
    first.rows[0]?.title === "First Song",
    `文件名应解析出曲名 First Song，实际 ${first.rows[0]?.title}`,
  );
  expect(
    first.rows[0]?.meta.includes("Alpha Artist") && first.rows[0]?.meta.includes("LOCAL"),
    `行内应显示歌手与 LOCAL 标记，实际 ${first.rows[0]?.meta}`,
  );
  expect(
    /^00:2[0-9]$/.test(first.rows[0]?.time ?? ""),
    `时长应由音频解码得到（00:25 左右），实际 ${first.rows[0]?.time}`,
  );
  expect(
    first.music?.playing === true && first.music?.track === beforeTrack,
    `导入不得打断当前播放，实际 track ${first.music?.track}（导入前 ${beforeTrack}）playing ${first.music?.playing}`,
  );
  await shot("imported");
  await step("imported", first);
  report.checks.push("import appears in the list, parses artist/title and reads the real duration");
  report.checks.push("import does not interrupt the current playback");

  // 3. 第二个文件（长破折号分隔）。
  await upload(fixtures[1]);
  const second = await read();
  expect(second.rows.length === 2, `再导入 1 个文件后应有 2 行，实际 ${second.rows.length}`);
  expect(
    second.rows[1]?.title === "Second Song" && second.rows[1]?.meta.includes("Beta Artist"),
    `长破折号分隔的文件名也应正确解析，实际 ${second.rows[1]?.title} / ${second.rows[1]?.meta}`,
  );
  await shot("two-rows");
  await step("two-rows", second);

  // 4. 刷新后仍在（IndexedDB 持久化），且照旧不进入阵列。
  await closeSettings();
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector("#stage")?.dataset.boot === "done",
    { timeout: 60000 },
  );
  await wait(1800);
  await openSettings();
  const reloaded = await read();
  expect(
    reloaded.rows.length === 2,
    `刷新后本地曲目应仍在（IndexedDB），实际 ${reloaded.rows.length} 行`,
  );
  expect(
    reloaded.music?.tracks?.filter((track) => track.file.startsWith("local:")).length === 2,
    "刷新后播放列表也应包含两条本地曲目",
  );
  expect(
    reloaded.selected === beforeSelected,
    `本地曲目不得改变阵列选择，实际 ${reloaded.selected}（期望 ${beforeSelected}）`,
  );
  await shot("after-reload");
  await step("after-reload", reloaded);
  report.checks.push("local tracks persist across reload and stay out of the array");

  // 5. 播放本地曲目：进入播放链路。
  const firstId = reloaded.rows[0]?.id ?? "";
  await page.click('#local-library .local-row [data-local-action="play"]');
  await wait(2000);
  const playingFirst = await read();
  expect(
    playingFirst.music?.playing === true && playingFile(playingFirst) === `local:${firstId}`,
    `点击播放后应播放该本地曲目，实际 ${playingFile(playingFirst)}（期望 local:${firstId}）`,
  );
  expect(
    playingFirst.rows[0]?.playing === true && playingFirst.rows[0]?.play.includes("暂停"),
    `正在播放的行应有播放态与暂停文案，实际 ${playingFirst.rows[0]?.play}`,
  );
  expect(
    playingFirst.playerTitle.includes("First Song"),
    `迷你播放器应显示本地曲目，实际 ${playingFirst.playerTitle}`,
  );
  expect(
    playingFirst.selected === beforeSelected,
    `播放本地曲目不得移动阵列选择，实际 ${playingFirst.selected}`,
  );
  await shot("playing-local");
  await step("playing-local", playingFirst);
  report.checks.push("local track plays through the shared audio chain");

  // 6. 编辑元数据：列表与播放器标题同时更新，播放不中断。
  await page.click('#local-library .local-row [data-local-action="edit"]');
  await page.waitForSelector('#local-library [data-local-field="title"]', { timeout: 10000 });
  await shot("editing");
  await page.click('#local-library [data-local-field="title"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type("Renamed Local Song");
  await page.click('#local-library [data-local-action="edit-save"]');
  await wait(1600);
  const edited = await read();
  await step("edited", edited);
  expect(
    edited.rows[0]?.title === "Renamed Local Song",
    `编辑后列表标题应更新，实际 ${edited.rows[0]?.title}`,
  );
  expect(
    edited.playerTitle.includes("Renamed Local Song"),
    `编辑后播放器标题应更新，实际 ${edited.playerTitle}`,
  );
  expect(
    playingFile(edited) === `local:${firstId}`,
    `改名不应改变正在播放的曲目，实际 ${playingFile(edited)}`,
  );
  await shot("edited");
  report.checks.push("editing title updates both the list and the mini player without restarting playback");

  // 7. 详情面板能看到正在播放的本地曲目（走带控制共用同一条链路）。
  await closeSettings();
  await page.click(".read-file");
  await wait(2000);
  let detailMode = (await read()).mode;
  if (detailMode !== "detail") {
    await page.evaluate(() => document.querySelector(".read-file").click());
    await wait(2000);
    detailMode = (await read()).mode;
  }
  expect(detailMode === "detail", `应能进入详情面板，实际 ${detailMode}`);
  await openSettings();
  await page.click('#local-library .local-row [data-local-action="play"]');
  await wait(2000);
  await closeSettings();
  const detail = await read();
  expect(
    detail.detailLocalHidden === false && detail.detailLocal.includes("LOCAL LIBRARY"),
    `详情面板应标注正在播放的本地曲目，实际 hidden=${detail.detailLocalHidden} text=${detail.detailLocal}`,
  );
  await shot("detail-local");
  await step("detail-local", detail);
  report.checks.push("detail panel reports the playing local track");
  await page.keyboard.press("Escape");
  await wait(1200);
  await openSettings();

  // 8. 删除正在播放的曲目：顺延到播放列表中的下一条（文档行为）。
  await page.click('#local-library .local-row [data-local-action="delete"]');
  await wait(600);
  const confirming = await read();
  expect(
    Boolean(await page.$('#local-library [data-local-action="delete-confirm"]')),
    "删除应先进入确认状态",
  );
  expect(
    confirming.rows[0]?.id === firstId,
    `确认行应对应被点击的那一条，实际 ${confirming.rows[0]?.id}`,
  );
  await shot("delete-confirm");
  await page.click('#local-library [data-local-action="delete-confirm"]');
  await wait(2200);
  const afterDelete = await read();
  const secondId = afterDelete.rows[0]?.id ?? "";
  expect(afterDelete.rows.length === 1, `删除后应剩 1 行，实际 ${afterDelete.rows.length}`);
  expect(
    !afterDelete.rows.some((row) => row.id === firstId),
    "被删除的曲目不应仍在列表里",
  );
  expect(
    playingFile(afterDelete) === `local:${secondId}`,
    `删除正在播放的曲目应顺延到下一条本地曲目，实际 ${playingFile(afterDelete)}（期望 local:${secondId}）`,
  );
  expect(
    afterDelete.selected === beforeSelected,
    `删除本地曲目不得改变阵列选择，实际 ${afterDelete.selected}`,
  );
  await shot("after-delete");
  await step("after-delete", afterDelete);
  report.checks.push("deleting the playing track advances to the next playlist entry");

  // 9. 删掉最后一条本地曲目：回绕到播放列表首位，列表回到空态。
  await page.click('#local-library .local-row [data-local-action="delete"]');
  await wait(500);
  await page.click('#local-library [data-local-action="delete-confirm"]');
  await wait(2200);
  const cleared = await read();
  expect(cleared.rows.length === 0 && cleared.empty, "删除全部本地曲目后应显示空态");
  expect(
    cleared.music?.tracks?.some((track) => track.file.startsWith("local:")) === false,
    "播放列表里不应残留本地曲目",
  );
  expect(
    playingFile(cleared) === cleared.music?.tracks?.[0]?.file,
    `删掉最后一条本地曲目应回绕到播放列表首位，实际 ${playingFile(cleared)}`,
  );
  await shot("empty");
  await step("empty", cleared);
  report.checks.push("removing the last local track wraps playback back to the first entry");

  // 10. 损坏／不支持的音频给出可读提示，且不进入列表。
  await upload(fixtures[2]);
  const broken = await read();
  expect(broken.rows.length === 0, `损坏文件不应进入列表，实际 ${broken.rows.length} 行`);
  expect(
    broken.statusKind === "error" &&
      broken.status.includes("Broken Upload.mp3") &&
      /不受支持|已损坏/.test(broken.status),
    `损坏文件应给出可读提示，实际 ${broken.statusKind} / ${broken.status}`,
  );
  await shot("broken-file");
  await step("broken-file", broken);
  report.checks.push("unsupported/corrupt file reports a readable message and is not stored");

  expect(errors.length === 0, `页面报错：${errors.join(" | ")}`);
} catch (error) {
  failures.push(`检查过程出错：${error instanceof Error ? error.message : String(error)}`);
} finally {
  report.passed = failures.length === 0;
  report.failures = failures;
  report.errors = errors;
  writeFileSync(`${out}/local-imports-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}

if (failures.length) {
  console.error(`本地曲库检查失败：\n- ${failures.join("\n- ")}`);
  console.error(`证据：${out}`);
  process.exit(1);
}
console.log(
  `本地曲库检查通过：导入、持久化、播放、编辑、删除与索引重映射均符合文档。证据见 ${out}。`,
);
