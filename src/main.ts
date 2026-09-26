import { createRollingClock } from "./rolling-clock";
import { InspectionOverlay } from "./inspection-overlay";
import { DocumentDecryption } from "./document-decryption";
import "./document-decryption.css";
import "./decryption.css";
import { escapeHtml } from "./html";
import { normalizeQuality, qualityPresets, type QualityPreset, type RenderQuality } from "./render-quality";
import { qualityMarkup, syncQualityUI } from "./quality-settings";
import { superPerformanceQuality, wallpaperQuality } from "./wallpaper-quality";
import "@kitlangton/rolling-number/styles.css";
import "./style.css";
import "./quality-settings.css";
import "./responsive.css";
import { viewportLayout, openingLayout } from "./viewport-layout";
import { assetUrl } from "./asset-url";
import { initPwa, pwaSettingsMarkup } from "./pwa";
import { createRollingNumber, createRollingText } from "@kitlangton/rolling-number";
import { ArchiveScene } from "./scene";
import { ContentTransition, SurfaceTransition } from "./ui-transitions";
import { BootSequence } from "./boot";
import { loadBootWebfonts } from "./boot-lettering";
import { wrap, sameCell, type ArchiveNavigation } from "./archive-loop";
import {
  records,
  categories,
  archiveColumns,
  columnFiles,
  fileLocation,
  formatDuration,
  applyLocalTracks,
  subscribeTracks,
  localSlotState,
  nextLocalSlot,
} from "./data";
import { TerminalAudio, localIdOf, musicTrackKey } from "./audio";
import { loadLyrics, activeLyric, formatLyricTime, type LyricLine } from "./lyrics";
import { appendPlayLog, clearPlayLog, formatPlayTime, readPlayLog } from "./play-log";
import { audioSettingsMarkup, localLibraryMarkup, type LocalLibraryUi } from "./audio-settings";
import {
  addLocalTrack,
  displayArtist,
  localTracksSupported,
  refreshLocalTracks,
  removeLocalTrack,
  subscribeLocalTracks,
  updateLocalTrack,
  type LocalTrackEntry,
} from "./local-tracks";
import {
  addToPlaylist,
  createPlaylist,
  getPlaylist,
  listPlaylists,
  moveInPlaylist,
  removeFromPlaylist,
  removePlaylist,
  renamePlaylist,
  subscribePlaylists,
} from "./playlists";
import { StartupGate } from "./startup";
import { isWallpaper, wallpaperHost, wallpaperFrame, type WallpaperProperties } from "./wallpaper";
import "./startup.css";
import "./wallpaper.css";
import { Workbench } from "./workbench";
let workbench: Workbench | undefined;
import { ArchivePlayground } from "./archive-playground";
import { ARRAY_OPENING_END, openingShowsDetail } from "./wallpaper-opening";
import { paintTheme, themeSettingsMarkup } from "./theme-ui";
let playground: ArchivePlayground | undefined;
import { WallpaperEffects } from "./wallpaper-effects";
import { WallpaperBackground } from "./wallpaper-background";
let wallpaperEffects: WallpaperEffects | undefined;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
import { logo, brandHeading } from "./brand";

$("#stage").innerHTML = `
  <div id="three-scene" class="three-scene"></div>
  <div class="scene-atmosphere archive-atmosphere"></div>
  <div id="boot-background" class="boot-background"><svg viewBox="0 0 1920 1080" preserveAspectRatio="none"><g fill="none" stroke="#fff" stroke-width="3"><path d="M-210 705C-45 705 182 704 247 567C337 377 99 306 4 435S27 680 169 631C309 584 227 314 279 111S568-113 568-113"/><path d="M1560-80C1374 114 1671 168 1601 323S1371 367 1431 480S1692 666 1559 787S1329 886 1498 1130"/><circle cx="1450" cy="648" r="346"/><circle cx="1450" cy="648" r="348"/></g></svg></div>
  <header class="brand">${brandHeading}</header>
  <nav class="system-nav" aria-label="系统导航">
    <button data-action="search"><span class="nav-glyph">⌕</span> TRACK INDEX <span class="key">/</span></button>
    <button data-action="playlists" aria-label="查看播放列表" title="播放列表">＋ PLAYLISTS <span id="playlist-count">00</span></button>
    <button class="settings-button" data-action="settings" aria-label="系统设置" title="系统设置"><span class="settings-glyph" aria-hidden="true">◷</span><span class="settings-label">设置</span></button>
  </nav>
  <button id="skip" class="skip" data-action="skip">ENTER SYSTEM <span>↗</span></button>
  <section id="boot" class="boot" aria-label="系统启动">
    <div class="access-text">ACCESS</div>
    <div class="boot-logo">${logo}</div>
    <div class="auth-status"><span>▪</span> <span id="auth-message"></span><i></i></div>
    <div class="scan"><svg viewBox="0 0 1920 1080" aria-hidden="true"><g fill="none" stroke="#080a08" stroke-width="2" stroke-linecap="round"><path/><path stroke="#fff"/><path/><path/><path/><path/><circle class="orbit-dot" r="8" fill="#ed821b" stroke="none"/><circle class="orbit-dot" r="8" fill="#ed821b" stroke="none"/><circle class="scan-core" cx="960" cy="540" r="5" fill="#080a08" stroke="none"/></g></svg><span>PERMISSION AUTHORIZED</span></div>
    <div class="welcome"><div class="welcome-panel"></div><div class="welcome-heading">WELCOME TO</div><div class="welcome-company"><strong>RHINE LAB.LLC.</strong><strong class="welcome-highlight" aria-hidden="true">RHINE LAB.LLC.</strong></div><div class="welcome-database">INTERNAL DATABASE</div><div class="welcome-logo">${logo}</div></div>
  </section>
  <svg id="inspection-marks" viewBox="0 0 1920 1080" aria-hidden="true"><path id="inspection-lines"/><g id="inspection-corners"></g><circle id="inspection-point" r="1.8"/></svg>
  <div id="inspection-text" aria-hidden="true">CONFIDENTIALITY:<strong>GENERAL BUSINESS USE</strong></div>
  <section id="archive-ui" class="archive-ui" aria-label="曲目选择">
    <div class="archive-callout"><div class="eyebrow">AUDIO ARCHIVE <span>／</span> <span id="archive-category">观测室</span></div><button class="file-title" data-action="open">TRACK NUMBER: <span id="selected-id">RM-<span id="selected-code">001</span></span><span class="file-open">↗</span></button><div class="callout-rule"><i></i></div><div class="file-summary"><span id="selected-title">AMBIENCE</span><span id="selected-clearance">READY</span></div><button class="read-file" data-action="open">PLAY TRACK <span>→</span></button></div>
    <div id="hover-label" class="hover-label" hidden>RM-<span id="hover-code">001</span> / <span id="hover-title"></span></div>
    <div class="archive-counter"><span class="tiny-label">TRACK / SELECT</span><div><span id="selected-number">01</span><i>/</i><span class="count-total">12</span></div></div>
    <div class="archive-navigation"><button data-action="prev" aria-label="上一首曲目">↑</button><div id="file-ticks" class="file-ticks"></div><button data-action="next" aria-label="下一首曲目">↓</button></div>
    <div class="column-navigation"><button data-action="column-prev" aria-label="上一列">←</button><div><span id="column-number">COLUMN <span id="column-index">03</span> / 05</span><strong id="column-name">观测室</strong></div><button data-action="column-next" aria-label="下一列">→</button></div>
    <div class="archive-hint"><kbd>←</kbd> <kbd>→</kbd> 切换列 <span>／</span> <kbd>↑</kbd> <kbd>↓</kbd> 前后曲目 <span>／</span> <kbd>ENTER</kbd> 播放</div>
  </section>
  <section id="detail-ui" class="detail-ui" aria-label="曲目信息" hidden>
    <button class="back-button" data-action="back">← <span>TRACK OVERVIEW</span><small>ESC</small></button>
    <div class="object-caption"><span id="object-id">NO.001</span><div>AUDIO ARCHIVE</div><small>DRAG TO INSPECT <span>↔</span></small></div>
    <article id="detail-content" class="detail-content"></article>
  </section>
  <div class="powered">POWERED BY <b>RHINE LAB</b><i></i></div>
  <footer class="system-footer"><span><i class="status-light"></i> SESSION AUTHORIZED${isWallpaper ? '<button type="button" class="three-toggle" data-action="toggle-three" aria-pressed="true" title="卸载三维模型，保留 2D 界面">3D 开启</button>' : ''}</span><span>JOYCE MOORE <i>／</i> <span id="clock">00:00:00</span></span><button data-action="replay" title="重播启动流程">REINITIALIZE ↗</button></footer>
  <div id="pwa-update-notice" class="pwa-update-notice" role="status" hidden><span>新版本已就绪</span><button data-pwa-action="update">更新并重启 ↻</button></div>
  <div id="modal-root"></div><div id="toast" class="toast" role="status"></div>
  <div id="loading" class="loading"><div class="loading-mark">${logo}</div><span>CONNECTING TO INTERNAL DATABASE</span><i></i></div>
`;

$("#boot-background").insertAdjacentHTML(
  "beforeend",
  '<div class="boot-white"></div>',
);
const bootSequence = new BootSequence($("#stage"));
$("#viewport").insertAdjacentHTML("beforeend", '<button class="mobile-entry" data-action="skip">进入档案 <span>→</span></button>');

type Mode = "boot" | "archive" | "detail";
let mode: Mode = "boot",
  selected = 0,
  bootStart = 0,
  lastStep = "",
  ready = false;
let modal: "search" | "playlists" | "settings" | null = null,
  searchQuery = "",
  filter = "全部曲目";
let activeTab = "overview";
const reviewParams = new URLSearchParams(location.search);
// 复核入口可指定初始页签，便于逐页对照（?scene=detail&tab=notes）；进入详情后即恢复常规行为。
let reviewTab: string | null = reviewParams.get("tab");
if (reviewTab) activeTab = reviewTab;
let frozenTime =
  reviewParams.get("freeze") === "1"
    ? Number(reviewParams.get("time") ?? 0)
    : null;
if (reviewParams.get("review") === "1") {
  $("#stage").dataset.review = "true";
  window.addEventListener("message", (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== window.parent ||
      event.data?.type !== "rhine-review-frame"
    )
      return;
    const t = Number(event.data.time);
    if (!Number.isFinite(t) || t < 0 || t >= 35) return;
    frozenTime = t;
    if (ready && mode !== "boot") setMode("boot");
  });
}
let toastTimer: ReturnType<typeof setTimeout>;
let previousFocus: HTMLElement | null = null;
const detailTransition = new SurfaceTransition($("#detail-ui"), undefined, 180, 180);
const tabTransition = new ContentTransition();
let modalTransition: SurfaceTransition | undefined;
let modalClosing = false;
let modalSiblings: { node: HTMLElement; inert: boolean }[] = [];
let pendingDetailFocus = false;
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const storedPrefs = readLocal<Partial<{ sound: boolean; music: boolean; soundVolume: number; musicVolume: number; musicTrack: number; musicLoop: string; reduced: boolean; quality: boolean; rendering: RenderQuality; superPerformance: boolean; colorTheme: "light" | "dark" }>>("rhine-settings", {});
const prefs = {
  sound: true,
  music: storedPrefs.sound ?? true,
  soundVolume: .55,
  musicVolume: .5,
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  quality: true,
  superPerformance: false,
  ...storedPrefs,
  musicTrack: typeof storedPrefs.musicTrack === "number" ? Math.round(storedPrefs.musicTrack) : -1,
  musicLoop: storedPrefs.musicLoop === "one" ? "one" as const : "all" as const,
  rendering: normalizeQuality(storedPrefs.rendering, storedPrefs.quality !== false),
  colorTheme: storedPrefs.colorTheme === "dark" ? "dark" : "light",
};
paintTheme(prefs.colorTheme === "dark" ? 1 : 0);
const rollingMotion = {
  duration: 460,
  motionBlur: true,
  animated: !prefs.reduced,
};
const updateFooterClock = createRollingClock($("#clock"));
const numberOptions = {
  ...rollingMotion,
  locales: "en-US",
  format: { minimumIntegerDigits: 2, useGrouping: false },
};
const fileCounter = createRollingNumber($("#selected-number"), {
  ...numberOptions,
  value: 1,
});
const columnCounter = createRollingNumber($("#column-index"), {
  ...numberOptions,
  value: 3,
});
const codeOptions = {
  ...numberOptions,
  format: { minimumIntegerDigits: 3, useGrouping: false },
  value: 1,
};
const textOptions = {
  ...rollingMotion,
  transition: "direct" as const,
  stagger: "none" as const,
};
const selectionTitle = createRollingText($("#selected-title"), {
  ...textOptions,
  text: $("#selected-title").textContent ?? "",
});
const columnTitle = createRollingText($("#column-name"), {
  ...textOptions,
  text: $("#column-name").textContent ?? "",
});
const hoverTitle = createRollingText($("#hover-title"), { ...textOptions, text: "" });
const categoryTitle = createRollingText($("#archive-category"), {
  ...textOptions,
  text: $("#archive-category").textContent ?? "",
});
const clearanceTitle = createRollingText($("#selected-clearance"), {
  ...textOptions,
  text: $("#selected-clearance").textContent ?? "",
});
const rollingTitles = [selectionTitle, columnTitle, hoverTitle, categoryTitle, clearanceTitle];
const selectedCode = createRollingNumber($("#selected-code"), codeOptions);
const hoverCode = createRollingNumber($("#hover-code"), codeOptions);
const audio = new TerminalAudio();
let musicSuppressed = false;
function configureAudio() { audio.configure({ ...prefs, music: prefs.music && !musicSuppressed }); }
configureAudio();
const reviewEntry = reviewParams.has("scene") || reviewParams.has("time") || reviewParams.get("review") === "1";
// 复核模式暴露只读状态，供 scripts/check-playback.mjs 这类交互检查读取真实播放与投影情况。
if (reviewEntry) {
  const debug = window as unknown as {
    rhineMusicState: () => ReturnType<TerminalAudio["musicState"]>;
    rhineSceneStats: () => ReturnType<ArchiveScene["getStats"]> | null;
  };
  debug.rhineMusicState = () => audio.musicState();
  debug.rhineSceneStats = () => scene?.getStats() ?? null;
}
let started = false;
const loading = $("#loading");
// The entry screen uses the actual viewport, including portrait phones; the
// reference animation still uses its calibrated 1920 x 1080 stage.
$("#viewport").append(loading);
$("#stage").inert = true;
$(".mobile-entry").inert = true;
const entry = !isWallpaper && !reviewEntry && (prefs.sound || prefs.music) ? new StartupGate({
  root: loading,
  unlock: () => audio.unlock(),
  cancel: () => audio.cancelEntry(),
  start: silent => completeStartup(silent),
}) : undefined;
if (entry) {
  audio.holdForEntry();
  if (prefs.music) void audio.prepareMusic().catch(() => { /* Entry offers retry. */ });
}
void audio.preparePlaylist().catch(() => { /* Manifest is optional. */ });
let audioPreview = false, audioPreviewRequest = 0;
let scene: ArchiveScene | undefined;
let threeState: "on" | "closing" | "off" | "loading" = "on";
let resumeCell: { lane: number; row: number } | undefined;
let resumeSelection = -1;
const accessLog: { id: string; time: string }[] = [];
const columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0]);
function recordAccess() {
  accessLog.unshift({
    id: records[selected].id,
    time: new Date().toLocaleTimeString("en-GB"),
  });
}
function saveAudioPrefs() {
  try {
    localStorage.setItem("rhine-settings", JSON.stringify(prefs));
  } catch {}
  configureAudio();
}
function superPerformanceEnabled() { return isWallpaper ? wallpaperHost()?.properties.superperformance?.value === true : prefs.superPerformance; }
function effectiveRenderQuality() { return superPerformanceEnabled() ? superPerformanceQuality : prefs.rendering; }
function savePrefs() {
  saveAudioPrefs();
  if (prefs.reduced) {
    rollingTitles.forEach(title => title.finish());
    detailTransition.finish();
    modalTransition?.finish();
    tabTransition.cancel();
  }
  scene?.setReduced(prefs.reduced);
  scene?.setTheme(prefs.colorTheme === "dark", prefs.reduced || !started);
  document.querySelectorAll<HTMLElement>("[data-color-theme]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.colorTheme === prefs.colorTheme)));
  scene?.setSuperPerformance(superPerformanceEnabled());
  scene?.setQuality(effectiveRenderQuality());
  syncQualityUI(prefs.rendering);
  updateQualitySummary();
  fileCounter.update({ animated: !prefs.reduced && mode === "archive" });
  rollingTitles.forEach(title => title.update({ animated: !prefs.reduced && mode === "archive" }));
  columnCounter.update({ animated: !prefs.reduced && mode === "archive" });
  selectedCode.update({ animated: !prefs.reduced && mode === "archive" });
  hoverCode.update({ animated: !prefs.reduced && mode === "archive" });
  $("#stage").classList.toggle("reduce-motion", prefs.reduced);
  syncWallpaperBackground();
}
let previousLayout = "";
function fit() {
  const stage = $("#stage");
  const viewport = $("#viewport");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const reference = reviewParams.has("time") || reviewParams.get("review") === "1";
  const { width, height, scale, kind } = mode === "boot" && !reference
    ? openingLayout(viewport.clientWidth, viewport.clientHeight)
    : viewportLayout(viewport.clientWidth, viewport.clientHeight, coarse, mode === "boot");
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
  stage.dataset.layout = kind;
  stage.dataset.touch = String(coarse);
  viewport.dataset.mobileBoot = String(mode === "boot" && (coarse || viewport.clientWidth < 1100));
  stage.style.setProperty("--stage-scale", String(scale));
  stage.style.setProperty("--opening-width", `${width}px`);
  stage.style.setProperty("--opening-height", `${height}px`);
  stage.style.setProperty("--opening-scan-scale", String(Math.min(1, width / 1920)));
  stage.dataset.openingPortrait = String(width < height);
  // The software keyboard resizes dialogs without recomposing the 3D scene.
  const visible = window.visualViewport;
  const stageTop = (viewport.clientHeight - height * scale) / 2;
  stage.style.setProperty("--modal-top", `${Math.max(0, (visible?.offsetTop ?? 0) - stageTop) / scale}px`);
  stage.style.setProperty("--modal-height", `${Math.min(height, (visible?.height ?? viewport.clientHeight) / scale)}px`);
  $("#viewport").style.setProperty("--scale", String(scale));
  const marks = document.querySelector("#inspection-marks");
  marks?.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const layoutKey = JSON.stringify([width, height, scale, kind, devicePixelRatio]);
  if (layoutKey !== previousLayout) {
    previousLayout = layoutKey;
    scene?.resize();
  }
  updateQualitySummary();
  // Re-measure line covers and tab underline after wrapping changes.
  requestAnimationFrame(() => {
    documentDecryption.refresh();
    const tab = document.querySelector<HTMLElement>(".detail-tabs button.active");
    const indicator = document.querySelector<HTMLElement>(".tab-indicator");
    if (tab && indicator) indicator.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`;
  });
}
window.addEventListener("resize", fit);
window.visualViewport?.addEventListener("resize", fit);
window.visualViewport?.addEventListener("scroll", fit);
matchMedia("(pointer: coarse)").addEventListener("change", fit);
fit();
$("#file-ticks").innerHTML = columnFiles(fileLocation(selected).lane)
  .map(
    (index) => `<button data-select="${index}"></button>`,
  )
  .join("");
const fileTicks = [...$("#file-ticks").querySelectorAll<HTMLButtonElement>("button")];

function setMode(next: Mode) {
  if (workbench?.enabled && next === "detail") next = "archive";
  const previousMode = mode;
  rollingTitles.forEach(title => title.update({ animated: !prefs.reduced && next === "archive" }));
  if (next !== "archive") {
    rollingTitles.forEach(title => title.finish());
    hoverCode.finish();
    $("#hover-label").hidden = true;
  }
  if (next === "detail" && mode !== "detail") recordAccess();
  mode = next;
  syncWallpaperBackground();
  audio.setScene(next);
  if (next !== "boot" && audioPreview) {
    audioPreview = false;
    audioPreviewRequest++;
    configureAudio();
  }
  $("#stage").dataset.mode = next;
  workbench?.syncVisibility();
  if (previousMode !== next) fit();
  $("#boot").inert = next !== "boot";
  $("#boot").setAttribute("aria-hidden", String(next !== "boot"));
  $("#archive-ui").inert = next !== "archive" || Boolean(modal) || Boolean(workbench?.enabled);
  $("#archive-ui").setAttribute("aria-hidden", String(next !== "archive" || Boolean(workbench?.enabled)));
  $(".system-nav").inert = next === "boot" || Boolean(modal);
  $(".system-footer").inert = next === "boot" || Boolean(modal);
  if (next === "detail") {
    if (previousMode !== "detail") detailTransition.show(prefs.reduced);
  } else if (previousMode === "detail" || (next === "boot" && !$("#detail-ui").hidden)) {
    pendingDetailFocus = false;
    tabTransition.cancel();
    detailTransition.hide(prefs.reduced || next === "boot");
    if (!modal && next === "archive") $(".read-file").focus({ preventScroll: true });
  }
  $("#detail-ui").inert = next !== "detail" || Boolean(modal);
  scene?.setMode(next === "boot" ? "hidden" : next);
  if (next !== "boot") {
    bootSequence.reset();
    $(".file-title").firstChild!.textContent = "TRACK NUMBER: ";
    $("#stage").dataset.boot = "done";
  }
  if (next === "detail" && previousMode !== "detail") {
    // 详情面板每次进入都会重建，渲染异常不应该静默留下空面板。
    try {
      renderDetail();
    } catch (error) {
      console.error(error);
      notify("曲目信息渲染失败，请刷新终端");
    }
    pendingDetailFocus = true;
    if (!scene) {
      $("#detail-content").style.opacity = "1";
      $("#detail-content").style.translate = "0 0";
      $("#detail-content").inert = false;
    }
  }
}
function select(index: number, navigation?: ArchiveNavigation) {
  selected = (index + records.length) % records.length;
  columnMemory[fileLocation(selected).lane] = selected;
  // 换曲目时回到播放页签；只在详情里重选才重置，避免吃掉复核入口指定的初始页签。
  if (mode === "detail") {
    setMode("archive");
    activeTab = reviewTab ?? "overview";
    reviewTab = null;
  }
  scene?.select(selected, navigation);
  updateSelection(navigation);
  const columnMove = navigation && "axis" in navigation && navigation.axis === "lane";
  audio.play(columnMove ? "column" : "tick", columnMove ? navigation.direction * .45 : 0);
}
function stepFile(direction: number) {
  const files = columnFiles(fileLocation(selected).lane);
  if (files.length < 2) return;
  const index = files[(files.indexOf(selected) + direction + files.length) % files.length];
  const navigation = { axis: "row" as const, direction };
  if (mode === "detail") swapInDetail(index, navigation);
  else {
    select(index, navigation);
    selectForPlayback();
  }
}
function stepColumn(direction: number) {
  const lane = fileLocation(selected).lane;
  const next = wrap(lane + direction, archiveColumns.length);
  const navigation = { axis: "lane" as const, direction };
  if (mode === "detail") swapInDetail(columnMemory[next], navigation);
  else {
    select(columnMemory[next], navigation);
    selectForPlayback();
  }
}
/** 详情内换曲目：留在详情，只换卡片封面与右栏内容（不再回落到阵列预览）。 */
function swapInDetail(index: number, navigation?: ArchiveNavigation) {
  selected = (index + records.length) % records.length;
  columnMemory[fileLocation(selected).lane] = selected;
  scene?.swapSelection(selected, navigation);
  updateSelection(navigation);
  renderDetail();
  selectForPlayback();
}
let selectionPlayTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * 选曲即成为播放目标：停顿片刻后切到该曲目并起播。
 * 停顿是为了连续浏览时不反复重启音频；设置里关闭了音乐、或本来就是这首时不动作。
 */
function selectForPlayback() {
  clearTimeout(selectionPlayTimer);
  const index = ensureQueueFor(records[selected]);
  if (index < 0 || !prefs.music) return;
  if (audio.musicState().track === index && audio.musicState().playing) return;
  selectionPlayTimer = setTimeout(() => {
    if (playlistIndex(records[selected]) !== index) return;
    prefs.musicTrack = index;
    saveAudioPrefs();
    audio.setPaused(false);
    updatePlaybackPanel();
  }, 350);
}
function updateSelection(navigation?: ArchiveNavigation) {
  const r = records[selected];
  const { lane } = fileLocation(selected);
  const files = columnFiles(lane);
  selectionTitle.update({ text: r.title, animated: !prefs.reduced && mode === "archive" });
  clearanceTitle.update({ text: r.pending ? "PENDING" : "READY", animated: !prefs.reduced && mode === "archive" });
  categoryTitle.update({ text: r.category, animated: !prefs.reduced && mode === "archive" });
  const direction =
    navigation && "axis" in navigation
      ? navigation.direction > 0
        ? "up"
        : "down"
      : "auto";
  selectedCode.update({
    // 曲目 id 是 RM-002 这种三字符前缀，直接 slice(2) 会把连字符一起取进来变成 -2。
    value: Number(r.id.split("-").pop() ?? 0),
    animated: !prefs.reduced && mode === "archive",
    direction,
  });
  fileCounter.update({
    value: files.indexOf(selected) + 1,
    animated: !prefs.reduced && mode === "archive",
    direction:
      navigation && "axis" in navigation && navigation.axis === "row"
        ? direction
        : "auto",
  });
  $(".count-total").textContent = String(files.length).padStart(2, "0");
  columnCounter.update({
    value: lane + 1,
    animated: !prefs.reduced && mode === "archive",
    direction:
      navigation && "axis" in navigation && navigation.axis === "lane"
        ? direction
        : "auto",
  });
  columnTitle.update({ text: archiveColumns[lane], animated: !prefs.reduced && mode === "archive" });
  $<HTMLButtonElement>('[data-action="column-prev"]').disabled = false;
  $<HTMLButtonElement>('[data-action="column-next"]').disabled = false;
  fileTicks.forEach((button, slot) => {
    const index = files[slot], record = records[index];
    button.dataset.select = String(index);
    button.setAttribute("aria-label", `选择档案 ${record.id} ${record.title}`);
    button.title = `${record.id} · ${record.title}`;
    button.classList.toggle("selected", index === selected);
    button.setAttribute("aria-pressed", String(index === selected));
  });
  updatePlaylistBadge();
}
function replayBoot(forcePreview = false) {
  if (!ready) return;
  closeModal(() => replayBootAfterModal(forcePreview));
}
function replayBootAfterModal(forcePreview: boolean) {
  bootStart = performance.now() / 1000 - 1.76;
  frozenTime = null;
  lastStep = "";
  setMode(prefs.reduced && !forcePreview ? "archive" : "boot");
  audio.restartBoot();
  scene?.select(0);
  selected = 0;
  updateSelection();
  if (!forcePreview) audio.play("ui-tick");
}
function openFile() {
  if (!ready) return;
  closeModal(() => {
    setMode("detail");
    selectForPlayback();
    audio.play("open");
  });
}
/* ---------------------------------------------------------------- 播放列表 */

/** 当前驱动播放队列的列表 id；null = 整个曲库。不持久化，刷新后回到整库。 */
let activePlaylistId: string | null = null;
/** 弹窗内的局部状态：选中的列表、行内编辑、删除确认，以及待加入的曲目标识。 */
const playlistPane = {
  selected: null as string | null,
  editing: null as "new" | "rename" | null,
  confirming: false,
  pendingKey: null as string | null,
};

/** 曲目标识：占位槽（没有音源）返回 null。 */
function playableKeyOf(index: number) {
  const record = records[index];
  return !record.pending && record.file ? musicTrackKey(record.file) : null;
}
function recordIndexByKey(key: string) {
  return records.findIndex(
    (record) =>
      !record.pending && record.file && musicTrackKey(record.file) === key,
  );
}
function playlistTrackLabel(key: string) {
  const index = recordIndexByKey(key);
  if (index < 0) return null;
  const record = records[index];
  return { id: record.id, title: record.title, artist: record.artist };
}

function updatePlaylistBadge() {
  const badge = document.querySelector<HTMLElement>("#playlist-count");
  if (badge) badge.textContent = String(listPlaylists().length).padStart(2, "0");
  document
    .querySelector<HTMLElement>('[data-action="playlists"]')
    ?.classList.toggle("active", activePlaylistId !== null);
}

/**
 * 播放某条曲目：若它不在当前队列里，先退出队列回到整库，再取播放列表下标。
 * 队列驱动整条播放链路，播放队列外的曲目必须显式退出，否则拿不到下标。
 */
function ensureQueueFor(record: (typeof records)[number]) {
  const direct = playlistIndex(record);
  if (direct >= 0 || !activePlaylistId) return direct;
  if (record.pending || !record.file) return -1;
  activePlaylistId = null;
  audio.setQueue(null);
  updatePlaylistBadge();
  return playlistIndex(record);
}

/** 列表内容变化后让引擎跟上；列表被删则退出队列。 */
function syncPlaylistQueue() {
  updatePlaylistBadge();
  if (!activePlaylistId) return;
  const list = getPlaylist(activePlaylistId);
  if (!list) {
    activePlaylistId = null;
    audio.setQueue(null);
    updatePlaylistBadge();
    return;
  }
  audio.setQueue(list.tracks);
  updatePlaybackPanel();
}

function startPlaylist(id: string) {
  const list = getPlaylist(id);
  if (!list) {
    notify("播放列表已不存在");
    return;
  }
  activePlaylistId = id;
  audio.setQueue(list.tracks);
  prefs.musicTrack = list.tracks.length ? 0 : -1;
  saveAudioPrefs();
  audio.setPaused(false);
  updatePlaylistBadge();
  updatePlaybackPanel();
  if (list.tracks.length) notify(`正在播放列表：${list.name}`);
  else notify(`「${list.name}」还没有曲目`);
}

function leavePlaylistQueue() {
  if (!activePlaylistId) return;
  activePlaylistId = null;
  audio.setQueue(null);
  updatePlaylistBadge();
  updatePlaybackPanel();
  notify("已回到整个曲库");
}

/** 从详情面板发起「加入播放列表」：打开列表弹窗，点哪个列表就加进哪个。 */
function openPlaylistPicker() {
  const key = playableKeyOf(selected);
  if (!key) {
    notify("该曲目尚未入库，无法加入列表");
    return;
  }
  playlistPane.pendingKey = key;
  playlistPane.editing = null;
  playlistPane.confirming = false;
  openModal("playlists");
}

function playlistNameValue() {
  return document.querySelector<HTMLInputElement>("#playlist-name")?.value ?? "";
}

function focusPlaylistInput() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLInputElement>("#playlist-name")
      ?.focus({ preventScroll: true });
  });
}

function playlistRowButtons(key: string, index: number, total: number) {
  const id = escapeHtml(key);
  return [
    `<button type="button" data-action="playlist-track-play" data-key="${id}" title="播放这一首">▶</button>`,
    `<button type="button" data-action="playlist-move" data-key="${id}" data-direction="-1"${index === 0 ? " disabled" : ""} title="上移">↑</button>`,
    `<button type="button" data-action="playlist-move" data-key="${id}" data-direction="1"${index === total - 1 ? " disabled" : ""} title="下移">↓</button>`,
    `<button type="button" data-action="playlist-remove" data-key="${id}" title="移出列表">移除</button>`,
  ].join("");
}

/** 播放列表弹窗内容；外层 <section class="terminal-modal"> 由 renderModal 提供。 */
function playlistsMarkup() {
  const lists = listPlaylists();
  if (playlistPane.selected && !getPlaylist(playlistPane.selected))
    playlistPane.selected = null;
  if (!playlistPane.selected && lists.length) playlistPane.selected = lists[0].id;
  const list = playlistPane.selected
    ? getPlaylist(playlistPane.selected)
    : undefined;
  const editing = playlistPane.editing;
  const pendingLabel = playlistPane.pendingKey
    ? playlistTrackLabel(playlistPane.pendingKey)
    : null;
  const hint = playlistPane.pendingKey
    ? `<p class="playlist-hint" role="status">正在加入「${escapeHtml(pendingLabel?.title ?? "该曲目")}」：点左侧任一列表即可。</p>`
    : "";
  const items = lists.length
    ? lists
        .map(
          (item) =>
            `<button type="button" class="playlist-item${item.id === playlistPane.selected ? " active" : ""}${item.id === activePlaylistId ? " playing" : ""}" data-playlist="${escapeHtml(item.id)}"><b>${escapeHtml(item.name)}</b><small>${item.tracks.length} 首</small></button>`,
        )
        .join("")
    : `<p class="playlist-empty">还没有播放列表。新建一个会自动填入曲库里的全部曲目，再按需删减。</p>`;
  const editor =
    editing === "new"
      ? `<div class="playlist-editor"><input id="playlist-name" type="text" maxlength="24" placeholder="列表名称" aria-label="新列表名称" autocomplete="off"/><button type="button" data-action="playlist-create">创建</button><button type="button" data-action="playlist-cancel">取消</button></div>`
      : editing === "rename"
        ? `<div class="playlist-editor"><input id="playlist-name" type="text" maxlength="24" value="${escapeHtml(list?.name ?? "")}" aria-label="列表名称" autocomplete="off"/><button type="button" data-action="playlist-rename-save">保存</button><button type="button" data-action="playlist-cancel">取消</button></div>`
        : "";
  const rows = list
    ? list.tracks
        .map((key, index) => {
          const label = playlistTrackLabel(key);
          const no = String(index + 1).padStart(2, "0");
          const actions = playlistRowButtons(key, index, list.tracks.length);
          return label
            ? `<div class="playlist-row" data-key="${escapeHtml(key)}"><span class="playlist-no">${no}</span><span class="playlist-name"><b>${escapeHtml(label.title)}</b><small>${escapeHtml(label.id)} · ${escapeHtml(label.artist)}</small></span><span class="playlist-actions">${actions}</span></div>`
            : `<div class="playlist-row playlist-row--missing" data-key="${escapeHtml(key)}"><span class="playlist-no">${no}</span><span class="playlist-name"><b>已失效</b><small>曲目已不在曲库</small></span><span class="playlist-actions">${actions}</span></div>`;
        })
        .join("")
    : "";
  const missing = list
    ? list.tracks.filter((key) => !playlistTrackLabel(key)).length
    : 0;
  const detail = list
    ? `<div class="playlist-head"><div><strong>${escapeHtml(list.name)}</strong><span>${list.tracks.length} 首${missing ? ` · ${missing} 首已失效` : ""}${list.id === activePlaylistId ? " · 正在播放" : ""}</span></div><div class="playlist-head-actions">${
        editing
          ? ""
          : `<button type="button" data-action="playlist-play"${list.tracks.length ? "" : " disabled"}>▶ 播放</button><button type="button" data-action="playlist-rename">重命名</button>${
              playlistPane.confirming
                ? `<button type="button" data-action="playlist-delete-confirm">确认删除</button><button type="button" data-action="playlist-cancel">取消</button>`
                : `<button type="button" data-action="playlist-delete">删除</button>`
            }`
      }</div></div>${editor}${
        list.tracks.length
          ? `<div class="playlist-rows">${rows}</div>`
          : `<p class="playlist-placeholder">列表已空。用曲目详情里的「加入播放列表」把曲目加回来，或再新建一个自动填满的列表。</p>`
      }`
    : `<p class="playlist-placeholder">左侧还没有可用的列表。先新建一个。</p>`;
  return `<h2>PLAYLISTS<small>播放列表</small></h2>${hint}<div class="playlist-layout"><div class="playlist-column"><div class="playlist-column-head"><span>LISTS / 列表</span>${
    editing
      ? ""
      : `<button type="button" data-action="playlist-new">＋ 新建列表</button>`
  }</div>${editing === "new" ? editor : ""}<div class="playlist-items">${items}</div></div><div class="playlist-detail">${detail}</div></div><div class="modal-bottom"><span>${lists.length} 个列表 · ${activePlaylistId ? "播放队列已切到列表" : "当前播整个曲库"}</span><span>RHINE MUSIC <i>●</i> PLAYLISTS</span></div>`;
}

function handlePlaylistAction(button: HTMLElement) {
  const action = button.dataset.action ?? "";
  const key = button.dataset.key ?? "";
  const listId = button.dataset.playlist ?? playlistPane.selected ?? "";
  if (action === "playlist-new") {
    playlistPane.editing = "new";
    playlistPane.confirming = false;
    renderModal();
    focusPlaylistInput();
    return;
  }
  if (action === "playlist-cancel") {
    playlistPane.editing = null;
    playlistPane.confirming = false;
    renderModal();
    return;
  }
  if (action === "playlist-create") {
    const created = createPlaylist(playlistNameValue(), audio.libraryKeys());
    if (!created) {
      notify("无法新建：名称无效或列表数量已达上限");
      renderModal();
      return;
    }
    playlistPane.editing = null;
    playlistPane.selected = created.id;
    renderModal();
    // 新列表自动填入整个曲库，再让用户删减。
    notify(`已新建列表：${created.name} · 已填入 ${created.tracks.length} 首`);
    return;
  }
  if (action === "playlist-rename") {
    if (!listId) return;
    playlistPane.editing = "rename";
    playlistPane.confirming = false;
    renderModal();
    focusPlaylistInput();
    return;
  }
  if (action === "playlist-rename-save") {
    if (!listId) return;
    const renamed = renamePlaylist(listId, playlistNameValue());
    playlistPane.editing = null;
    renderModal();
    notify(renamed ? "列表已重命名" : "名称无效，未修改");
    return;
  }
  if (action === "playlist-delete") {
    playlistPane.confirming = true;
    renderModal();
    return;
  }
  if (action === "playlist-delete-confirm") {
    if (!listId) return;
    const removed = getPlaylist(listId);
    removePlaylist(listId);
    playlistPane.confirming = false;
    if (playlistPane.selected === listId) playlistPane.selected = null;
    if (activePlaylistId === listId) {
      activePlaylistId = null;
      audio.setQueue(null);
      updatePlaybackPanel();
    }
    renderModal();
    notify(removed ? `已删除列表：${removed.name}` : "列表已不存在");
    return;
  }
  if (action === "playlist-play") {
    if (!listId) return;
    startPlaylist(listId);
    renderModal();
    return;
  }
  if (action === "playlist-track-play") {
    if (!listId || !key) return;
    startPlaylist(listId);
    const index = audio
      .musicState()
      .tracks.findIndex((track) => musicTrackKey(track.file) === key);
    if (index >= 0) {
      prefs.musicTrack = index;
      saveAudioPrefs();
      audio.setPaused(false);
      updatePlaybackPanel();
    }
    renderModal();
    return;
  }
  if (action === "playlist-move") {
    if (!listId || !key) return;
    moveInPlaylist(listId, key, button.dataset.direction === "-1" ? -1 : 1);
    syncPlaylistQueue();
    renderModal();
    return;
  }
  if (action === "playlist-remove") {
    if (!listId || !key) return;
    removeFromPlaylist(listId, key);
    syncPlaylistQueue();
    renderModal();
    return;
  }
  if (button.dataset.playlist) {
    if (playlistPane.pendingKey) {
      const target = button.dataset.playlist;
      const result = addToPlaylist(target, playlistPane.pendingKey);
      const name = getPlaylist(target)?.name ?? "列表";
      playlistPane.pendingKey = null;
      renderModal();
      notify(
        result === "added"
          ? `已加入「${name}」`
          : result === "exists"
            ? `「${name}」里已有这首`
            : result === "full"
              ? `「${name}」已达曲目上限`
              : "列表已不存在",
      );
      return;
    }
    playlistPane.selected = button.dataset.playlist;
    playlistPane.editing = null;
    playlistPane.confirming = false;
    renderModal();
  }
}

function renderDetail() {
  tabTransition.cancel();
  const r = records[selected];
  const playable = !r.pending;
  // 本地导入的曲目音源在 IndexedDB 里，file 是 local:<id>；面板上给出可读来源。
  const source = r.localId ? "LOCAL LIBRARY · 本机导入" : (r.file ?? "");
  const status = r.localId ? "可播放 · 本地曲库" : "可播放 · 本地音源";
  $("#object-id").textContent = "NO." + String(selected + 1).padStart(3, "0");
  $("#detail-content").innerHTML = `
  <div class="detail-kicker"><span>TRACK ${r.id}</span><span>${playable ? "READY" : "PENDING"}</span></div>
  <h2 class="${r.title.length > 16 ? "compact" : ""}">${escapeHtml(r.title)}</h2><div class="detail-title-cn">${escapeHtml(r.artist)}<span>${escapeHtml(r.category)}</span></div>
  <div class="detail-rule"></div>
  <dl class="metadata"><div><dt>COLLECTION / 曲库分类</dt><dd>${escapeHtml(r.category)}</dd></div><div><dt>DURATION / 时长</dt><dd>${formatDuration(r.duration)}</dd></div><div><dt>SOURCE / 音源</dt><dd class="metadata-file" title="${playable ? escapeHtml(r.file ?? "") : ""}">${playable ? escapeHtml(source) : "尚未入库"}</dd></div><div><dt>STATUS / 状态</dt><dd><i></i>${playable ? status : "占位曲目 · 待入库"}</dd></div></dl>
  <div class="detail-tabs" role="tablist"><button id="tab-overview" class="active" role="tab" aria-controls="tab-panel" aria-selected="true" data-tab="overview">01 <span>播放</span></button><button id="tab-notes" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="notes">02 <span>歌词</span></button><button id="tab-history" role="tab" aria-controls="tab-panel" aria-selected="false" data-tab="history">03 <span>播放记录</span></button><i class="tab-indicator" aria-hidden="true"></i></div>
  <div id="tab-panel" class="tab-panel" role="tabpanel">${overview()}</div>
  <div class="detail-actions"><button class="solid-button" data-action="playlist-add"${playable ? "" : " disabled"}>＋ ADD TO PLAYLIST<span>加入播放列表</span></button>${playable ? `<button class="solid-button" data-action="play-track">${playingTrack() ? "❚❚ PAUSE" : "▶ PLAY"}<span>${playingTrack() ? "暂停" : "播放"}</span></button>` : `<button class="solid-button" disabled>▶ PENDING<span>尚未入库</span></button>`}</div>
  ${playable ? "" : `<div class="detail-footnote"><span>占位曲目，仅用于填满五列阵列，没有音源</span><span>${String(selected + 1).padStart(3, "0")} / ${String(records.length).padStart(3, "0")}</span></div>`}`;
  $("#detail-content").setAttribute("tabindex", "-1");
  documentDecryption.reset($("#detail-content"), prefs.reduced || !scene || scene.decryptionFrame.phase === "clear");
  setTab(activeTab, false);
  updatePlaybackPanel();
}
/** 选中曲目是否就是音频引擎正在播放的那一条。 */
function playingTrack() {
  const state = audio.musicState();
  return state.playing && state.wanted === playlistIndex(records[selected]);
}
/**
 * 曲目与播放列表的对应关系。按文件名（本地曲目按 id）比较真实标识，
 * 不按标题——标题可以手动编辑，同名标题也会互相混淆；本地曲目追加在列表末尾，
 * 因此已入库曲目的下标不受导入影响。
 */
function playlistIndex(track: (typeof records)[number]) {
  if (track.pending || !track.file) return -1;
  const key = musicTrackKey(track.file);
  return audio.musicState().tracks.findIndex(
    (item) => musicTrackKey(item.file) === key,
  );
}
function overview() {
  const r = records[selected];
  return `<div class="panel-label">NOW PLAYING</div>
  <div class="now-playing"><strong>${escapeHtml(r.title)}</strong></div>
  <input id="playback-seek" class="playback-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="播放进度" ${playingTrack() ? "" : "disabled"} />
  <div class="playback-time"><span id="playback-elapsed">00:00</span><span id="playback-duration">${formatDuration(r.duration)}</span></div>
  <div class="playback-transport">
    <button data-action="play-prev" aria-label="上一首">◀◀</button>
    <button class="playback-transport-main" data-action="play-track" aria-label="播放或暂停">${playingTrack() ? "❚❚" : "▶"}</button>
    <button data-action="play-next" aria-label="下一首">▶▶</button>
    <button data-action="play-loop" aria-pressed="${prefs.musicLoop === "one"}" aria-label="循环模式">${prefs.musicLoop === "one" ? "↻ 单曲" : "↻ 列表"}</button>
  </div>
  <p id="playback-local" class="playback-local" hidden></p>
  ${activePlaylistId ? `<p class="playback-queue" role="status"><span>PLAYLIST</span><b>${escapeHtml(getPlaylist(activePlaylistId)?.name ?? "")}</b><button type="button" data-action="playlist-leave">退出列表</button></p>` : ""}
  <p class="playback-note">${r.pending ? "占位曲目：音源尚未入库，等待后续补充真实文件与时长。" : r.localId ? "音源来自本机导入的本地曲库（IndexedDB），与设置中的迷你播放器共用同一条音频链路。" : "音源来自 public/audio，与设置中的迷你播放器共用同一条音频链路。"}</p>`;
}
/** 把音频引擎的播放状态写回面板；播放列表里没有的曲目保持静默。 */
function updatePlaybackPanel() {
  const seek = document.querySelector<HTMLInputElement>("#playback-seek");
  if (!seek) return;
  const r = records[selected];
  const index = playlistIndex(r);
  const state = audio.musicState();
  const active = index >= 0 && state.wanted === index;
  const progress = active && state.duration > 0 ? Math.min(1, state.time / state.duration) : 0;
  seek.disabled = !active;
  if (active && !musicSeeking) seek.value = String(Math.round(progress * 1000));
  seek.style.setProperty("--seek-progress", `${(progress * 100).toFixed(2)}%`);
  const elapsed = document.querySelector("#playback-elapsed");
  if (elapsed) elapsed.textContent = active ? formatDuration(state.time) : "00:00";
  const duration = document.querySelector("#playback-duration");
  if (duration)
    duration.textContent = active && state.duration > 0 ? formatDuration(state.duration) : formatDuration(r.duration);
  const main = document.querySelector<HTMLButtonElement>(".playback-transport-main");
  if (main) main.textContent = playingTrack() ? "❚❚" : "▶";
  const action = document.querySelector<HTMLButtonElement>('.detail-actions [data-action="play-track"]');
  if (action?.firstChild) {
    const playing = playingTrack();
    action.firstChild.textContent = playing ? "❚❚ PAUSE" : "▶ PLAY";
    const label = action.querySelector("span");
    if (label) label.textContent = playing ? "暂停" : "播放";
  }
  const loop = document.querySelector<HTMLButtonElement>('[data-action="play-loop"]');
  if (loop) {
    loop.textContent = prefs.musicLoop === "one" ? "↻ 单曲" : "↻ 列表";
    loop.setAttribute("aria-pressed", String(prefs.musicLoop === "one"));
  }
  const local = document.querySelector<HTMLElement>("#playback-local");
  if (local) {
    const now = state.track >= 0 ? state.tracks[state.track] : undefined;
    const localId = now ? localIdOf(now.file) : null;
    local.hidden = !localId;
    if (now && localId)
      local.innerHTML = `<span>LOCAL LIBRARY</span><b>${escapeHtml(now.title)}</b><i>·</i>${escapeHtml(displayArtist(now.subtitle))}`;
  }
  syncLocalPlaying();
}
/** 详情面板的走带控制：与设置里的迷你播放器共用同一条音频链路。 */
function controlPlayback(action: string) {
  if (action === "loop") {
    prefs.musicLoop = prefs.musicLoop === "one" ? "all" : "one";
    saveAudioPrefs();
    updatePlaybackPanel();
    return;
  }
  const index = ensureQueueFor(records[selected]);
  if (index < 0) {
    notify("该曲目尚未入库，暂时无法播放");
    return;
  }
  if (action === "track") {
    const state = audio.musicState();
    if (state.wanted === index && state.playing) audio.setPaused(true);
    else {
      prefs.musicTrack = index;
      saveAudioPrefs();
      audio.setPaused(false);
    }
  } else if (action === "prev" || action === "next") {
    prefs.musicTrack = index;
    saveAudioPrefs();
    audio.skip(action === "prev" ? -1 : 1);
  }
  updatePlaybackPanel();
}
/** 歌词页签：有 LRC 时按播放进度高亮并滚动；没有则说明原因。 */
function lyricsMarkup(track: (typeof records)[number]) {
  if (!track.lyrics)
    return `<div class="panel-label">LYRICS / 歌词</div><p class="playback-note">${track.localId ? "本地导入的曲目没有歌词：LRC 只与 tracks.json 里登记的曲目配套。" : track.pending ? "占位曲目暂无歌词。" : "该曲目尚未关联歌词文件。在 content/tracks.json 里为曲目补上 lyrics 字段即可。"}</p>`;
  return `<div class="panel-label">LYRICS / 歌词</div><div id="lyrics-panel" class="lyrics-panel"><p class="playback-note">正在载入歌词…</p></div>`;
}
let lyricLines: LyricLine[] | null = null;
let lyricTrackId = "";
async function hydrateLyrics(track: (typeof records)[number]) {
  const panel = document.querySelector<HTMLElement>("#lyrics-panel");
  if (!panel) return;
  const lines = await loadLyrics(track.lyrics ? assetUrl(`lyrics/${track.lyrics}`) : null);
  if (!document.body.contains(panel)) return;
  lyricLines = lines;
  lyricTrackId = track.id;
  if (!lines) {
    panel.innerHTML = `<p class="playback-note">歌词文件未能载入。</p>`;
    return;
  }
  panel.innerHTML = lines
    .map(
      (line, index) =>
        `<p class="lyric-line" data-line="${index}"><span>${formatLyricTime(line.time)}</span>${escapeHtml(line.text)}</p>`,
    )
    .join("");
  updateLyricsHighlight(audio.musicState());
}
/** 只有「选中的曲目正在播放」时才有实时行；否则列出全部歌词供阅读。 */
function updateLyricsHighlight(state: ReturnType<TerminalAudio["musicState"]>) {
  const panel = document.querySelector<HTMLElement>("#lyrics-panel");
  if (!panel || !lyricLines || lyricTrackId !== records[selected].id) return;
  const index = playlistIndex(records[selected]);
  const synced = index >= 0 && state.wanted === index && state.playing;
  const active = synced ? activeLyric(lyricLines, state.time) : -1;
  panel.querySelectorAll<HTMLElement>(".lyric-line").forEach((line, i) => {
    line.classList.toggle("active", i === active);
  });
  panel.classList.toggle("synced", synced);
  if (!synced || active < 0) return;
  const current = panel.querySelector<HTMLElement>(`[data-line="${active}"]`);
  if (!current) return;
  const top = current.offsetTop - panel.clientHeight / 2 + current.clientHeight / 2;
  panel.scrollTo({ top: Math.max(0, top), behavior: prefs.reduced ? "auto" : "smooth" });
}
/** 播放记录页签：本机保存的真实起播记录。 */
function historyMarkup(track: (typeof records)[number]) {
  const entries = readPlayLog();
  const rows = entries.length
    ? entries
        .slice(0, 12)
        .map(
          (entry) =>
            `<div class="log-row"><span>${formatPlayTime(entry.at)}</span><span>${escapeHtml(entry.artist)}</span><b>${escapeHtml(entry.title)}</b></div>`,
        )
        .join("")
    : `<p class="playback-note">本次终端还没有播放记录。播放任意曲目后，这里会按时间列出曲名与歌手。</p>`;
  return `<div class="panel-label">PLAY LOG / 播放记录</div>${rows}
  <div class="play-log-foot"><span>本机记录 ${entries.length} 条 · 当前曲目 ${playingTrack() ? "播放中" : "未播放"}</span><button data-action="clear-log">清空记录</button></div>
  <p class="log-note">记录保存在当前浏览器，不随曲目库同步；占位曲目无法播放，因此不会出现在这里。当前查看 ${escapeHtml(track.artist)}。</p>`;
}
function setTab(tab: string, sound = true) {
  if (sound && tab === activeTab) return;
  activeTab = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    const active = (b as HTMLElement).dataset.tab === tab;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
    b.setAttribute("tabindex", active ? "0" : "-1");
  });
  const r = records[selected];
  const tabButton = $<HTMLButtonElement>(`[data-tab="${tab}"]`);
  const indicator = $(".tab-indicator");
  indicator.style.transition = sound ? "" : "none";
  indicator.style.transform = `translateX(${tabButton.offsetLeft}px) scaleX(${tabButton.offsetWidth})`;
  $("#tab-panel").setAttribute("aria-labelledby", tabButton.id);
  $("#tab-panel").innerHTML =
    tab === "overview" ? overview() : tab === "notes" ? lyricsMarkup(r) : historyMarkup(r);
  $("#tab-panel").scrollTop = 0;
  documentDecryption.refresh();
  if (tab === "notes") void hydrateLyrics(r);
  if (sound) {
    tabTransition.reveal($("#tab-panel"), prefs.reduced);
    audio.play("ui-tick");
  }
}
/* ---------------------------------------------------------------- 本地曲库 */
let localEntries: LocalTrackEntry[] = [];
let localBusy = false;
let localError = "";
let localPanel: { editing: string | null; confirming: string | null } = {
  editing: null,
  confirming: null,
};

function localMessage(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message.trim() : "";
  return text || fallback;
}

const playingLocalId = () => {
  const state = audio.musicState();
  const playing = state.track >= 0 ? state.tracks[state.track] : undefined;
  return playing ? localIdOf(playing.file) : null;
};

/** 重画设置面板里的本地曲库区块；面板未打开时不做任何事。 */
function refreshLocalLibrary() {
  const host = document.querySelector<HTMLElement>("#local-library");
  if (!host) return;
  const slots = localSlotState();
  const ui: LocalLibraryUi = {
    supported: localTracksSupported(),
    busy: localBusy,
    error: localError,
    editing: localPanel.editing,
    confirming: localPanel.confirming,
    slots: { used: slots.used, capacity: slots.capacity, remaining: slots.remaining },
  };
  host.innerHTML = localLibraryMarkup(localEntries, ui);
  syncLocalPlaying();
}

/** 播放状态只改高亮与按钮文案，不重建节点（重建会把导入中的文件选择器换掉）。 */
function syncLocalPlaying() {
  const host = document.querySelector<HTMLElement>("#local-library");
  if (!host) return;
  const id = playingLocalId();
  host.querySelectorAll<HTMLElement>(".local-row").forEach((row) => {
    const playing = Boolean(id) && row.dataset.localId === id;
    row.classList.toggle("playing", playing);
    const button = row.querySelector<HTMLElement>('[data-local-action="play"]');
    if (button) button.textContent = playing ? "❚❚ 暂停" : "▶ 播放";
  });
}

function focusLocalEditor() {
  requestAnimationFrame(() => {
    document
      .querySelector<HTMLInputElement>('#local-library [data-local-field="title"]')
      ?.focus({ preventScroll: true });
  });
}

/**
 * 导入：按 records 顺序填第一个空占位槽（槽位随条目持久保存）。
 * 占位槽用尽时不再写入 IndexedDB、也不占位；多选时部分成功、部分失败会分开说明。
 * 导入不改变播放列表里的既有下标，也不动正在播放的曲目。
 */
async function importLocalFiles(files: File[]) {
  if (!localTracksSupported()) {
    localError = "本地曲库不可用：当前浏览器未开放本地存储。";
    refreshLocalLibrary();
    notify(localError);
    return;
  }
  localBusy = true;
  localError = "";
  refreshLocalLibrary();
  const failures: string[] = [];
  let added = 0;
  const rejected: string[] = [];
  for (const file of files) {
    const slot = nextLocalSlot();
    if (slot === null) {
      // 占位槽用尽：不写 IndexedDB、不占位，只记录并给出提示。
      rejected.push(file.name);
      continue;
    }
    try {
      await addLocalTrack(file, slot);
      added++;
    } catch (error) {
      failures.push(localMessage(error, `无法导入「${file.name}」。`));
    }
  }
  localBusy = false;
  const slots = localSlotState();
  if (rejected.length)
    failures.push(
      `阵列占位槽已用尽（${slots.used} / ${slots.capacity}）：${rejected.length} 个文件未导入（首个「${rejected[0]}」）；删除已有本地曲目后可以继续导入。`,
    );
  localError = failures.join(" ");
  await refreshLocalTracks().catch((error) => {
    localError = localMessage(error, "本地曲库读取失败。");
  });
  refreshLocalLibrary();
  if (added && failures.length) notify(`已导入 ${added} 首，${failures.length} 项未导入`);
  else if (added) notify(`已导入 ${added} 首本地曲目`);
  if (failures.length) notify(failures[0]);
}

function playLocalTrack(id: string) {
  const state = audio.musicState();
  const index = state.tracks.findIndex((track) => track.localId === id);
  if (index < 0) {
    notify("本地曲目未能载入，请重新打开设置面板");
    return;
  }
  if (state.track === index && state.playing) {
    audio.setPaused(true);
  } else {
    prefs.musicTrack = index;
    saveAudioPrefs();
    audio.setPaused(false);
    notify(`正在播放：${state.tracks[index].title}`);
  }
  updatePlaybackPanel();
  syncLocalPlaying();
}

async function saveLocalEdit() {
  const id = localPanel.editing;
  if (!id) return;
  const host = document.querySelector<HTMLElement>("#local-library");
  const field = (name: string) =>
    host?.querySelector<HTMLInputElement>(`[data-local-field="${name}"]`)?.value ??
    "";
  const title = field("title").trim();
  const artist = field("artist");
  if (!title) {
    localError = "标题不能为空；如需清空歌手可以留空，界面会显示 UNKNOWN。";
    refreshLocalLibrary();
    return;
  }
  try {
    await updateLocalTrack(id, { title, artist });
  } catch (error) {
    localError = localMessage(error, "本地曲目更新失败。");
    refreshLocalLibrary();
    notify(localError);
    return;
  }
  localError = "";
  localPanel = { editing: null, confirming: null };
  refreshLocalLibrary();
  updatePlaybackPanel();
  notify("元数据已更新");
}

async function deleteLocal(id: string) {
  localPanel = { editing: null, confirming: null };
  try {
    await removeLocalTrack(id);
  } catch (error) {
    localError = localMessage(error, "本地曲目删除失败。");
    refreshLocalLibrary();
    notify(localError);
    return;
  }
  localError = "";
  refreshLocalLibrary();
  updatePlaybackPanel();
  notify("已从本地曲库删除");
}

function handleLocalAction(button: HTMLElement) {
  const action = button.dataset.localAction;
  const id = button.dataset.localId ?? "";
  if (action === "import") {
    document.querySelector<HTMLInputElement>("#local-import")?.click();
    return;
  }
  if (action === "play") playLocalTrack(id);
  else if (action === "edit") {
    localPanel = { editing: id, confirming: null };
    refreshLocalLibrary();
    focusLocalEditor();
  } else if (action === "edit-cancel") {
    localPanel = { editing: null, confirming: null };
    refreshLocalLibrary();
  } else if (action === "edit-save") void saveLocalEdit();
  else if (action === "delete") {
    localPanel = { editing: null, confirming: id };
    refreshLocalLibrary();
  } else if (action === "delete-cancel") {
    localPanel = { editing: null, confirming: null };
    refreshLocalLibrary();
  } else if (action === "delete-confirm") void deleteLocal(id);
}

/**
 * 曲库到位（或发生增删改）后同步阵列以外的一切：顶部标题、卡片状态、详情面板、
 * 检索结果与播放面板。曲库覆盖本身由 data.ts 完成（槽位几何不变）。
 */
function syncTrackLibrary() {
  updateSelection();
  scene?.refreshRecord();
  if (mode === "detail") renderDetail();
  if (modal === "search") renderResults();
  updatePlaybackPanel();
}

subscribeLocalTracks((next) => {
  localEntries = next;
  // 引擎按稳定标识重映射：导入/改名不打断播放，删除正在播放的曲目则顺延下一条。
  audio.setLocalTracks(next);
  // 本地曲目覆盖占位槽：同一首永远落在同一个方块上。
  applyLocalTracks(next);
  refreshLocalLibrary();
});
subscribePlaylists(() => {
  syncPlaylistQueue();
  if (modal === "playlists") renderModal();
});
subscribeTracks(syncTrackLibrary);

function notify(message: string) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 2600);
}

function openModal(kind: NonNullable<typeof modal>) {
  if (!ready) return;
  if (!modal) {
    previousFocus = document.activeElement as HTMLElement;
    modalSiblings = [...$("#stage").children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.id !== "modal-root")
      .map((node) => ({ node, inert: node.inert }));
    modalSiblings.forEach(({ node }) => (node.inert = true));
  }
  modalClosing = false;
  modal = kind;
  searchQuery = "";
  filter = "全部曲目";
  audio.play("page-open");
  renderModal();
}
function closeModal(afterClose?: () => void) {
  if (!modal) {
    afterClose?.();
    return;
  }
  if (modalClosing) return;
  modalClosing = true;
  audio.play("page-close");
  modalTransition!.hide(prefs.reduced, () => {
    modal = null;
    modalClosing = false;
    $("#modal-root").replaceChildren();
    modalTransition = undefined;
    modalSiblings.forEach(({ node, inert }) => (node.inert = inert));
    modalSiblings = [];
    $("#archive-ui").inert = mode !== "archive" || Boolean(workbench?.enabled);
    $("#detail-ui").inert = mode !== "detail";
    previousFocus?.focus({ preventScroll: true });
    afterClose?.();
  });
}
function renderModal() {
  if (!modal) return;
  modalTransition?.dispose();
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="terminal-modal ${modal === "settings" ? "settings-modal" : modal === "playlists" ? "playlists-modal" : ""}" role="dialog" aria-modal="true" aria-label="${modal === "settings" ? "系统设置" : modal === "playlists" ? "播放列表" : "曲库检索"}"><div class="modal-top"><span>RHINE MUSIC / ${modal === "settings" ? "SYSTEM PREFERENCES" : "AUDIO DIRECTORY"}</span><button data-action="close-modal" aria-label="关闭窗口">CLOSE <span>×</span></button></div>${modal === "settings" ? settingsMarkup() : modal === "playlists" ? playlistsMarkup() : `<h2>TRACK INDEX<small>内部曲库检索</small></h2><div class="search-field"><span>⌕</span><input id="archive-search" type="search" autocomplete="off" placeholder="输入曲目编号、名称或歌手" aria-label="检索曲目"/><span class="key">ESC</span></div><div class="category-filters">${categories.map((c, i) => `<button data-filter="${escapeHtml(c)}" class="${i === 0 ? "active" : ""}">${escapeHtml(c)}</button>`).join("")}</div><div class="result-header"><span>TRACK / 曲目</span><span>COLLECTION / 分类</span><span>STATUS</span></div><div id="search-results" class="search-results"></div><div class="modal-bottom"><span id="result-count"></span><span>AUDIO ARCHIVE <i>●</i> CONNECTED</span></div>`}</section></div>`;
  const backdrop = $(".modal-backdrop");
  backdrop.hidden = true;
  modalTransition = new SurfaceTransition(backdrop, $(".terminal-modal"));
  modalTransition.show(prefs.reduced);
  if (modal === "settings") {
    refreshLocalLibrary();
    updateQualitySummary();
  }
  if (modal === "search") {
    renderResults();
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $("#archive-search").focus();
    });
  } else if (modal === "playlists") {
    requestAnimationFrame(() => {
      if (!backdrop.isConnected || modalClosing) return;
      if (playlistPane.editing) focusPlaylistInput();
      else $('[data-action="close-modal"]').focus({ preventScroll: true });
    });
  } else
    requestAnimationFrame(() => {
      if (backdrop.isConnected && !modalClosing) $('[data-action="close-modal"]').focus();
    });
  $("#modal-root")
    .querySelector(".modal-backdrop")
    ?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeModal();
    });
}
function renderResults() {
  const results = records
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        (filter === "全部曲目" || r.category === filter) &&
        `${r.id} ${r.title} ${r.artist} ${r.category}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
    );
  $("#search-results").innerHTML = results.length
    ? results
        .map(
          ({ r, i }) =>
            `<button class="result-row" data-result="${i}"><span class="result-name"><b>${r.id}</b><span>${escapeHtml(r.title)}<small>${escapeHtml(r.artist)}</small></span></span><span>${escapeHtml(r.category)}</span><span>${r.pending ? "PENDING" : "READY"} <i>↗</i></span></button>`,
        )
        .join("")
    : `<div class="empty-results"><strong>没有匹配的曲目</strong><p>尝试其他曲名、曲目编号，或切换曲库分类。</p><button data-action="reset-search">重置检索 →</button></div>`;
  $("#result-count").textContent =
    `${String(results.length).padStart(2, "0")} TRACKS FOUND`;
}
function updateQualitySummary() {
  const summary = document.querySelector("#quality-summary");
  if (!summary) return;
  if (!scene) { summary.textContent = "3D 已关闭 · 三维模型与渲染资源已释放"; return; }
  const canvas = scene.renderer.domElement;
  const metrics = JSON.parse(canvas.parentElement?.dataset.renderQuality ?? "{}");
  summary.textContent = `${superPerformanceEnabled() ? "超级性能模式已启用 · 画质设置暂被覆盖，关闭后恢复 · " : ""}实际渲染 ${canvas.width} × ${canvas.height} · ${effectiveRenderQuality().antialias === "smaa" ? "SMAA" : "原始抗锯齿"} · 纹理 ${metrics.anisotropy ?? 1}×${metrics.limited ? " · 已达到缓冲上限" : ""}`;
}
function motionSettingsMarkup() {
  return `<div id="motion-preference-note" class="motion-preference-note"><p>${prefs.reduced
    ? `当前已减少动态效果。${matchMedia("(prefers-reduced-motion: reduce)").matches ? "系统也请求减少动画，可仅为本站启用完整动效。" : "关闭上方开关可恢复完整动效。"}`
    : "当前使用完整动效。"}</p>${prefs.reduced ? '<button data-action="enable-motion">启用完整动效并重播 ↻</button>' : ""}</div>`;
}
function settingsMarkup() {
  return `<h2>SYSTEM SETTINGS<small>终端偏好设置</small></h2><p class="settings-intro">JOYCE MOORE <span>·</span> SESSION AUTHORIZED</p>${isWallpaper ? '<p class="wallpaper-settings-note">每次启动都会读取 Wallpaper Engine 中的设置。在此修改仅对当前运行生效，无法持久保存；如需保留，请在 Wallpaper Engine 的壁纸属性中调整。</p>' : ""}<div class="settings-list">${themeSettingsMarkup(prefs.colorTheme === "dark")}${!isWallpaper ? `<label><div><strong>SUPER PERFORMANCE</strong><span>降低三维画质和渲染分辨率，保留完整动效；关闭后恢复原画质</span></div><input type="checkbox" data-pref="superPerformance" ${prefs.superPerformance ? "checked" : ""}/><i class="toggle"></i></label>` : ""}${workbench?.settingsMarkup() ?? ""}${audioSettingsMarkup(prefs)}<label><div><strong>REDUCED MOTION</strong><span>跳过开机动画，简化选档、镜头和文字动效</span></div><input type="checkbox" data-pref="reduced" ${prefs.reduced ? "checked" : ""}/><i class="toggle"></i></label></div>${motionSettingsMarkup()}<section id="local-library" class="local-library" aria-label="本地曲库"></section>${qualityMarkup(prefs.rendering)}${pwaSettingsMarkup()}<div class="settings-shortcuts">${isWallpaper ? '<span>DESKTOP CONTROLS</span><p>拖动阵列或点击界面按钮浏览档案。桌面模式下，方向键与滚轮可能无法传入壁纸。</p>' : '<span>KEYBOARD CONTROLS</span><p><kbd>←</kbd><kbd>→</kbd> 切列 <kbd>↑</kbd><kbd>↓</kbd> 选档 <kbd>ENTER</kbd> 读取 <kbd>/</kbd> 检索 <kbd>ESC</kbd> 返回</p>'}</div><div class="settings-bottom">${!isWallpaper && document.fullscreenEnabled ? '<button data-action="fullscreen">FULLSCREEN <span>↗</span></button>' : ''}<button data-action="restart">REINITIALIZE SYSTEM <span>↻</span></button></div><div class="modal-bottom"><span>ANALYSIS OS / 1.0 · 使用 MiSans 字体（小米） <a href="${assetUrl("fonts/MiSans-license.pdf")}" target="_blank" rel="noopener">字体许可</a></span><span>POWERED BY RHINE LAB</span></div>`;
}

let musicSeeking = false;
document.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement | null;
  // 详情面板的进度条拖动期间不回写数值。
  if (target?.id === "playback-seek") musicSeeking = true;
});
window.addEventListener("pointerup", () => { musicSeeking = false; });
window.addEventListener("pointercancel", () => { musicSeeking = false; });
/**
 * 引擎换曲（自然播完、上一首/下一首、队列重映射）后把播放目标同步回偏好。
 * 不做这一步，之后任意 saveAudioPrefs() 都可能把音频拉回旧曲目。
 */
function syncMusicPrefs() {
  const state = audio.musicState();
  if (state.wanted >= 0 && prefs.musicTrack !== state.wanted) {
    prefs.musicTrack = state.wanted;
    saveAudioPrefs();
  }
}
let lastPlayedFile = "";
let playbackWasActive = false;
let followingPlayback = false;
window.addEventListener("rhine-music-state", () => {
  syncMusicPrefs();
  updatePlaybackPanel();
  syncLocalPlaying();
  const state = audio.musicState();
  const active = state.playing && state.track >= 0;
  if (state.track < 0) {
    // 播放列表或场景联动接管后清空，便于再次播放同一曲目时重新记录、重新跟随。
    lastPlayedFile = "";
    playbackWasActive = false;
    updateLyricsHighlight(state);
    return;
  }
  const playing = state.tracks[state.track];
  const changed = playing.file !== lastPlayedFile;
  // 暂停后重新起播也要处理（补记一次播放、重新跟随）。
  const restarted = active && !playbackWasActive;
  lastPlayedFile = playing.file;
  playbackWasActive = active;
  // 只在「播放目标真的换了」或「重新起播」时处理：否则选曲后音频尚未切换的
  // 那几帧，每次状态刷新都会把选择拉回上一首，和用户的选择互相抢。
  // 按曲目标识而不是下标判断：本地曲目被删后顺延可能落到同一个下标上。
  if (!changed && !restarted) {
    updateLyricsHighlight(state);
    return;
  }
  const key = musicTrackKey(playing.file);
  const index = records.findIndex(
    (item) => !!item.file && musicTrackKey(item.file) === key,
  );
  if (index < 0) {
    // 极端情况：本地条目还没落到阵列槽位（例如曲库读取晚于播放列表）。
    // 只记录这次播放，不动阵列选择。
    const localId = localIdOf(playing.file);
    if (active && localId) {
      const entry = localEntries.find((item) => item.id === localId);
      appendPlayLog({
        id: playing.file,
        title: entry?.title ?? playing.title,
        artist: displayArtist(entry?.artist ?? playing.subtitle),
        at: Date.now(),
      });
      if (mode === "detail" && activeTab === "history") setTab("history", false);
    }
    updateLyricsHighlight(state);
    return;
  }
  // 只有真的起播才写播放记录：暂停状态下被删曲目的顺延只更新界面。
  if (active) {
    appendPlayLog({ id: records[index].id, title: playing.title, artist: records[index].artist, at: Date.now() });
    if (mode === "detail" && activeTab === "history") setTab("history", false);
  }
  // 播放列表切歌（面板上的上一首／下一首、设置里的迷你播放器）时，
  // 阵列选择、卡片封面与右栏一起跟随；在详情里就地替换，不把用户踢回阵列。
  if (index !== selected && !followingPlayback) {
    followingPlayback = true;
    try {
      if (mode === "detail") swapInDetail(index);
      else select(index);
    } finally {
      followingPlayback = false;
    }
    updatePlaybackPanel();
  }
  updateLyricsHighlight(state);
});
document.addEventListener("input", (e) => {
  const slider = e.target as HTMLInputElement;
  if (slider.dataset.quality) {
    const output = document.querySelector<HTMLOutputElement>(`[data-quality-output="${slider.dataset.quality}"]`);
    if (output) output.value = `${slider.value}%`;
  }
  const volume = e.target as HTMLInputElement;
  if (volume.dataset.volume === "musicVolume" || volume.dataset.volume === "soundVolume") {
    prefs[volume.dataset.volume] = Number(volume.value) / 100;
    volume.closest("label")?.querySelector("output")?.replaceChildren(`${volume.value}%`);
    saveAudioPrefs();
  }
  if (volume.id === "playback-seek") {
    // 详情面板的进度条：拖动即在播放下调整位置，同时立刻回显时间。
    const fraction = Number(volume.value) / 1000;
    audio.seek(fraction);
    volume.style.setProperty("--seek-progress", `${(fraction * 100).toFixed(2)}%`);
    const state = audio.musicState();
    const elapsed = document.querySelector("#playback-elapsed");
    if (elapsed && state.duration > 0) elapsed.textContent = formatDuration(fraction * state.duration);
  }
  if ((e.target as HTMLElement).id === "archive-search") {
    searchQuery = (e.target as HTMLInputElement).value;
    renderResults();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "local-import") {
    const files = [...(el.files ?? [])];
    el.value = "";
    if (files.length) void importLocalFiles(files);
    return;
  }
  if (el.id === "quality-preset" && Object.hasOwn(qualityPresets, el.value)) {
    prefs.rendering = { ...qualityPresets[el.value as QualityPreset] };
    savePrefs();
  } else if (el.dataset.quality) {
    const key = el.dataset.quality as keyof RenderQuality;
    prefs.rendering = normalizeQuality({ ...prefs.rendering, [key]: key === "antialias" ? el.value : Number(el.value) });
    savePrefs();
  }
  if (el.dataset.pref) {
    const key = el.dataset.pref;
    if (key === "sound" || key === "music" || key === "reduced" || key === "quality" || key === "superPerformance") prefs[key] = el.checked;
    if (key === "sound" || key === "music") saveAudioPrefs(); else savePrefs();
    if (key === "reduced") $("#motion-preference-note").outerHTML = motionSettingsMarkup();
    audio.play("confirm");
  }
});
document.addEventListener("click", (e) => {
  const themeButton = (e.target as Element).closest<HTMLElement>("[data-color-theme]");
  if (themeButton) { prefs.colorTheme = themeButton.dataset.colorTheme === "dark" ? "dark" : "light"; savePrefs(); return; }
  const localControl = (e.target as Element).closest<HTMLElement>("[data-local-action]");
  if (localControl && !(localControl as HTMLButtonElement).disabled) {
    handleLocalAction(localControl);
    audio.play("tick");
    return;
  }
  const playlistControl = (e.target as Element).closest<HTMLElement>(
    '[data-playlist], [data-action^="playlist-"]',
  );
  if (
    playlistControl &&
    !(playlistControl as HTMLButtonElement).disabled &&
    modal === "playlists"
  ) {
    handlePlaylistAction(playlistControl);
    audio.play("tick");
    return;
  }
  if (!started) return;
  if (modalClosing) return;
  const el = (e.target as Element).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.select) {
    select(Number(el.dataset.select));
    selectForPlayback();
    return;
  }
  if (el.dataset.result) {
    const index = Number(el.dataset.result);
    closeModal(() => {
      select(index);
      selectForPlayback();
      openFile();
    });
    return;
  }
  if (el.dataset.filter) {
    filter = el.dataset.filter;
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          (b as HTMLElement).dataset.filter === filter,
        ),
      );
    renderResults();
    return;
  }
  if (el.dataset.tab) {
    setTab(el.dataset.tab);
    return;
  }
  const action = el.dataset.action;
  if (action === "toggle-three") { void toggleThree(); return; }
  if (action === "sound-preview") audio.play("confirm");
  if (action === "skip") {
    setMode("archive");
    audio.play("confirm");
  }
  if (action === "prev") stepFile(-1);
  if (action === "next") stepFile(1);
  if (action === "column-prev") stepColumn(-1);
  if (action === "column-next") stepColumn(1);
  if (action === "open") openFile();
  if (action === "back") {
    setMode("archive");
    audio.play("back");
  }
  if (action === "search" || action === "playlists" || action === "settings") {
    el.focus({ preventScroll: true });
    openModal(action);
  }
  if (action === "close-modal") closeModal();
  if (action === "playlist-add") {
    openPlaylistPicker();
    return;
  }
  if (action === "playlist-leave") {
    leavePlaylistQueue();
    renderDetail();
    return;
  }
  if (action === "clear-log") {
    clearPlayLog();
    setTab("history", false);
    notify("播放记录已清空");
  }  if (action?.startsWith("play-")) controlPlayback(action.slice(5));
  if (action === "reset-search") {
    modal = "search";
    searchQuery = "";
    filter = "全部曲目";
    renderModal();
  }
  if (action === "replay" || action === "restart") {
    replayBoot();
  }
  if (action === "enable-motion") {
    prefs.reduced = false;
    savePrefs();
    replayBoot();
  }
  if (action === "fullscreen" && document.fullscreenEnabled) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen()
        .catch(() => notify("请使用浏览器的全屏快捷键 F11"));
  }
});
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (playground?.active && !modal) {
    if (e.key === "Escape") { e.preventDefault(); playground.stop(); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "/"].includes(e.key) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    return;
  }
  if (modalClosing) {
    e.preventDefault();
    return;
  }
  const typing = e.target instanceof HTMLInputElement;
  if (e.key === "Escape") {
    if (modal) closeModal();
    else if (mode === "detail" || (mode === "boot" && ready)) { const sound = mode === "detail" ? "back" : "ui-tick"; setMode("archive"); audio.play(sound); }
    return;
  }
  if (modal && e.key === "Tab") {
    const focusables = [
      ...$("#modal-root").querySelectorAll<HTMLElement>(
        'button,input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
      ),
    ];
    const visible = focusables.filter(el => el.getClientRects().length > 0);
    const first = visible[0],
      last = visible.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
    return;
  }
  if (typing || modal || !ready) return;
  if (
    (e.target as HTMLElement).dataset.tab &&
    ["ArrowLeft", "ArrowRight"].includes(e.key)
  ) {
    e.preventDefault();
    const tabs = ["overview", "notes", "history"];
    setTab(
      tabs[(tabs.indexOf(activeTab) + (e.key === "ArrowRight" ? 1 : 2)) % 3],
    );
    $<HTMLButtonElement>(`[data-tab="${activeTab}"]`).focus();
    return;
  }
  if (e.key === "/") {
    e.preventDefault();
    if (mode === "boot") setMode("archive");
    openModal("search");
  }
  if (e.key === "ArrowLeft" && mode !== "boot") {
    e.preventDefault();
    stepColumn(-1);
  }
  if (e.key === "ArrowRight" && mode !== "boot") {
    e.preventDefault();
    stepColumn(1);
  }
  if (["ArrowUp", "ArrowDown"].includes(e.key) && mode !== "boot") {
    e.preventDefault();
    stepFile(e.key === "ArrowUp" ? -1 : 1);
  }
  if (
    e.key === "Enter" &&
    (document.activeElement === document.body ||
      document.activeElement?.id === "detail-content" ||
      ["prev", "next", "column-prev", "column-next"].includes(
        (document.activeElement as HTMLElement)?.dataset.action ?? "",
      ) ||
      (document.activeElement as HTMLElement)?.dataset.select)
  ) {
    e.preventDefault();
    if (mode === "boot") setMode("archive");
    else if (mode === "archive") openFile();
  }
});

const ease = (t: number) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function bootFrame(t: number) {
  if (isWallpaper && !scene && frozenTime === null && t >= 21.9) {
    setMode("archive");
    return undefined;
  }
  if (isWallpaper && frozenTime === null && t >= ARRAY_OPENING_END &&
      !openingShowsDetail(wallpaperHost()?.properties.openingdetail?.value, !!workbench?.enabled)) {
    setMode("archive");
    return undefined;
  }
  audio.updateBoot(t, frozenTime !== null);
  const motion = bootSequence.update(t);
  if (workbench?.enabled && frozenTime === null) {
    const end = openingShowsDetail(wallpaperHost()?.properties.openingdetail?.value, true) ? 35 : ARRAY_OPENING_END;
    if (t > end - .35) $(".powered").style.opacity = String(1 - ease((t - end + .35) / .35));
  }
  let step: string = motion.step;
  if (t >= 22) {
    step = "array";
  }
  if (t >= 25.68) {
    step = "select";
  }
  if (t >= 28.3) {
    step = "inspect";
  }
  if (step !== lastStep) {
    $("#stage").dataset.boot = step;
    lastStep = step;
  }
  $(".file-title").firstChild!.textContent =
    step === "array"
      ? "SELECTING FILES...".slice(0, Math.max(0, Math.floor((t - 21.94) * 18)))
      : "TRACK NUMBER: ";
  $("#stage").style.setProperty(
    "--entry-opacity",
    String(ease((t - 21.9) / 0.13)),
  );
  $(".callout-rule").style.transform = `scaleX(${ease((t - 22.08) / 0.9)})`;
  const reveal = ease((t - 22) / 0.4),
    lift = ease((t - 26) / 1.8),
    zoom = 0.55 * ease((t - 27.3) / 1.65) + 0.45 * ease((t - 29.0) / 5.0);
  if (t >= 35) {
    setMode("detail");
    return undefined;
  }
  return { reveal, lift, zoom, time: t };
}

const inspectionOverlay = new InspectionOverlay();
const documentDecryption = new DocumentDecryption();
// A newly opened archive can introduce another font shard. Re-measure its
// redaction lines after font swap while retaining the current reveal progress.
document.fonts.addEventListener("loadingdone", () => documentDecryption.refresh());

let lastTime = 0,
  frameCount = 0,
  frameStart = performance.now(),
  fps = 0;
function frame(ms: number) {
  if (!wallpaperFrame(ms)) { requestAnimationFrame(frame); return; }
  if (document.hidden) { requestAnimationFrame(frame); return; }
  workbench?.tick();
  const time = ms / 1000;
  const theme = scene?.themeAmount ?? (prefs.colorTheme === "dark" ? 1 : 0);
  paintTheme(theme);
  playground?.tick(time);
  const cinema =
    mode === "boot" && ready
      ? bootFrame(frozenTime ?? time - bootStart)
      : undefined;
  wallpaperEffects?.update(time, prefs.reduced);
  // The calibrated 2D opening fully covers the scene until array entry.
  if (!cinema || cinema.time >= 21.9) scene?.update(time, cinema);
  if (threeState === "closing" && scene?.presentationHidden) releaseThree();
  playground?.position();
  if (scene && mode === "detail") {
    documentDecryption.update(time, scene.decryptionFrame, prefs.reduced);
    $("#detail-content").style.opacity = String(scene.detailVisibility);
    $("#detail-content").style.translate =
      `0 ${(1 - scene.detailVisibility) * 18}px`;
    $("#detail-content").inert = scene.detailVisibility < 0.1;
    if (pendingDetailFocus && scene.detailVisibility >= 0.1 && !modal) {
      $("#detail-content").focus({ preventScroll: true });
      pendingDetailFocus = false;
    }
  }
  $("#stage").style.setProperty("--detail-shade", String(mode === "boot" ? 0 : scene?.detailVisibility ?? 0));
  const currentScene = scene;
  if (currentScene) inspectionOverlay.render(currentScene.decryptionFrame,
    (x, y) => currentScene.projectCard(x, y), Boolean(cinema));
  if (Math.floor(time) !== lastTime) {
    lastTime = Math.floor(time);
    updateFooterClock(new Date(), !prefs.reduced);
  }
  frameCount++;
  if (ms - frameStart > 1000) {
    fps = (frameCount * 1000) / (ms - frameStart);
    frameStart = ms;
    frameCount = 0;
    $("#three-scene").dataset.fps = String(Math.round(fps));
    $("#three-scene").dataset.renderStats = JSON.stringify(scene?.getStats() ?? { loaded: false, drawCalls: 0, triangles: 0 });
  }
  requestAnimationFrame(frame);
}
function bindScene(scene: ArchiveScene, cell?: { lane: number; row: number }) {
    scene.select(selected, cell ? { cell } : undefined);
    scene.onSelect = (i, cell) => {
      if (mode !== "archive" || modal) return;
      // 再次点击已经抬起的那张卡片 = 进入播放界面。选中格位的阵列实例是隐藏的，
      // 能在该格位命中的只有抽取模型本身，因此按格位判断即可区分「点自己」与「点别的卡片」。
      if (cell && sameCell(cell, scene.selectedCellSnapshot)) {
        openFile();
        return;
      }
      select(i, cell ? { cell } : undefined);
      selectForPlayback();
    };
    scene.onNavigate = (axis, direction) => {
      if (mode !== "archive" || modal) return;
      if (axis === "lane") stepColumn(direction);
      else stepFile(direction);
    };
    scene.onHover = (i) => {
      const label = $("#hover-label");
      if (i === null) {
        label.hidden = true;
        hoverCode.finish();
        hoverTitle.finish();
        return;
      }
      const animated = !prefs.reduced && mode === "archive";
      hoverCode.update({
        value: Number(records[i].id.split("-").pop() ?? 0),
        animated: !label.hidden && animated,
      });
      hoverTitle.update({ text: records[i].title, animated: !label.hidden && animated });
      label.hidden = false;
      // Prepare the first visible value so the next hover can animate immediately.
      hoverCode.update({ animated });
      hoverTitle.update({ animated });
    };
}
function syncThreeButton() {
  $("#stage").dataset.threeState = threeState;
  syncWallpaperBackground();
  const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-three"]');
  if (!button) return;
  button.textContent = threeState === "loading" ? "3D 载入中…" : threeState === "closing" ? "3D 关闭中…" : threeState === "off" ? "3D 关闭" : "3D 开启";
  button.disabled = threeState === "loading";
  button.setAttribute("aria-pressed", String(threeState === "on"));
  button.title = threeState === "off" ? "重新载入三维模型" : threeState === "closing" ? "取消关闭，恢复三维画面" : "卸载三维模型，保留 2D 界面";
}
function releaseThree() {
  if (!scene) return;
  resumeCell = { ...scene.getStats().selectedCell }; resumeSelection = selected;
  scene.dispose(); scene = undefined;
  if (mode === "detail") {
    $("#detail-content").style.opacity = "1";
    $("#detail-content").style.translate = "0 0";
    $("#detail-content").inert = false;
    documentDecryption.reset($("#detail-content"), true);
  }
  threeState = "off"; syncThreeButton();
  $("#hover-label").hidden = true;
  delete $("#three-scene").dataset.renderQuality;
  updateQualitySummary();
}
async function toggleThree() {
  if (!isWallpaper || !ready || threeState === "loading") return;
  if (threeState === "closing") {
    scene?.setPresentationVisible(true, prefs.reduced);
    threeState = "on"; syncThreeButton(); return;
  }
  if (scene) {
    playground?.stop();
    threeState = "closing"; syncThreeButton();
    scene.setPresentationVisible(false, prefs.reduced);
    if (prefs.reduced) releaseThree();
    return;
  }
  threeState = "loading"; syncThreeButton();
  let next: ArchiveScene | undefined;
  try {
    next = new ArchiveScene($("#three-scene"));
    next.renderer.domElement.style.opacity = "0";
    next.setPresentationVisible(false, true);
    await next.load();
    next.setMode(mode === "detail" ? "detail" : "archive");
    next.setTrackLabels(false);
    bindScene(next, resumeSelection === selected ? resumeCell : undefined);
    next.revealImmediately();
    scene = next;
    scene.setTheme(prefs.colorTheme === "dark", true);
    scene.setArchiveCoverage(wallpaperHost()?.properties.archivecoverage?.value === "extra");
    savePrefs();
    scene.setPresentationVisible(true, prefs.reduced);
    threeState = "on"; syncThreeButton();
  } catch (error) {
    next?.dispose(); scene = undefined;
    threeState = "off"; syncThreeButton();
    notify("三维模型载入失败，请点击 3D 关闭重试。");
    console.error(error);
  }
}

/**
 * 启动时的曲库读取：IndexedDB 不可用（隐私模式等）时只记错误并继续，
 * 阵列退化为全占位，其余功能不受影响。
 */
async function loadLocalLibrary() {
  try {
    await refreshLocalTracks();
  } catch (error) {
    localError = localMessage(error, "本地曲库不可用。");
    refreshLocalLibrary();
  }
}

async function start() {
  try {
    if (isWallpaper) await window.rhineWallpaperPropertiesReady;
    // 本地曲库（IndexedDB）是异步的。先把曲库读回来并覆盖占位槽，再建阵列，
    // 这样阵列只会按最终内容渲染一次：不会先摆满占位再错位或闪烁，
    // 也不会发生「曲库回来时正在播放的曲目被打断」。
    await loadLocalLibrary();
    if (!isWallpaper || wallpaperHost()?.properties.load3donstartup?.value !== false) {
      scene = new ArchiveScene($("#three-scene"));
      scene.setTheme(prefs.colorTheme === "dark", true);
      scene.setArchiveCoverage(wallpaperHost()?.properties.archivecoverage?.value === "extra");
    } else {
      threeState = "off";
      syncThreeButton();
    }
    await Promise.all([
      scene?.load(),
      loadBootWebfonts(),
      // With unicode-range faces, preload the opening's actual characters,
      // not every font shard. Other archive text loads on demand.
      document.fonts.load("300 20px MiSans", "ACCESS WELCOME TO INTERNAL DATABASE"),
      document.fonts.load("400 20px MiSans", "身份信息确认请求已接收开始处理权限验证通过欢迎访问莱茵生命内部资料档案编号保密级别商业区选择档案：0123456789 JOYCE MOORE"),
      document.fonts.load("600 20px MiSans", "SYNTHESIZE INFORMATION ANALYSIS OS"),
      document.fonts.load("700 20px MiSans", "RHINE LAB WELCOME TO INTERNAL DATABASE"),
    ]);
    if (scene) {
      // 主界面不要曲名索引签（用户 2026-09-21 定）：场景机制保留，默认整排隐藏。
      scene.setTrackLabels(false);
      bindScene(scene);
    }
    savePrefs();
    ready = true;
    select(0);
    if (entry) entry.ready();
    else {
      if (isWallpaper) {
        // CEF allows automatic audio; never block the visual on audio policy or decoding.
        await Promise.race([audio.unlock(), new Promise(resolve => setTimeout(resolve, 3000))]);
      }
      completeStartup(false);
    }
  } catch (error) {
    console.error(error);
    $("#loading").innerHTML =
      '<div class="error-state"><strong>CONNECTION INTERRUPTED</strong><p>三维档案资源未能载入。请确认浏览器已启用硬件加速，然后重新连接。</p><button onclick="location.reload()">RECONNECT →</button></div>';
  }
}
function completeStartup(silent: boolean) {
  if (started || !ready) return;
  started = true;
  if (silent) {
    prefs.sound = false;
    prefs.music = false;
    saveAudioPrefs();
  }
  audio.releaseEntry();
  audio.restartBoot();
  const fade = prefs.reduced ? 0 : 600;
  bootStart = performance.now() / 1000 - (reviewParams.has("time") ? Number(reviewParams.get("time")) : 1.76);
  if (!reviewParams.has("time")) bootStart += fade / 1000;
  setMode("boot");
  if (reviewParams.get("scene") === "archive" || (prefs.reduced && !reviewParams.has("time"))) setMode("archive");
  if (reviewParams.get("scene") === "detail") setMode("detail");
  if (isWallpaper && wallpaperHost()?.properties.boot?.value === false) setMode("archive");
  $("#stage").inert = false;
  $(".mobile-entry").inert = false;
  loading.classList.add("loaded");
  loading.inert = true;
  setTimeout(() => {
    const restoreFocus = loading.contains(document.activeElement) || document.activeElement === document.body;
    loading.remove();
    if (entry && restoreFocus) {
      const skip = $("#skip");
      const target = mode === "boot" ? skip.getClientRects().length ? skip : $(".mobile-entry") : $(".read-file");
      target.focus({ preventScroll: true });
    }
  }, fade);
  requestAnimationFrame(frame);
  // Do not compete with entry audio/font downloads. Full offline installation
  // begins after startup is complete and remains atomic.
  setTimeout(() => void initPwa(notify), 1500);
}
updateSelection();
const customBackground = isWallpaper ? new WallpaperBackground($("#stage"), notify) : undefined;
function syncWallpaperBackground(retry = false) {
  customBackground?.update(wallpaperHost()?.properties ?? {}, mode !== "boot" && (threeState === "off" || threeState === "loading"), prefs.reduced, retry);
}
if (isWallpaper) {
  const apply = (properties: WallpaperProperties) => {
    const theme = properties.colortheme?.value;
    if (theme === "light" || theme === "dark") prefs.colorTheme = theme;
    scene?.setArchiveCoverage(properties.archivecoverage?.value === "extra" || wallpaperHost()?.properties.archivecoverage?.value === "extra");
    for (const key of ["sound", "music", "reduced"] as const)
      if (typeof properties[key]?.value === "boolean") prefs[key] = properties[key].value as boolean;
    for (const key of ["soundVolume", "musicVolume"] as const) {
      const value = properties[key.toLowerCase()]?.value;
      if (typeof value === "number" && Number.isFinite(value)) prefs[key] = Math.max(0, Math.min(1, value / 100));
    }
    const qualityProperties = { ...wallpaperHost()?.properties, ...properties };
    if (Object.keys(properties).some(key => key === "renderquality" || key.startsWith("quality")))
      prefs.rendering = wallpaperQuality(qualityProperties, prefs.rendering);
    savePrefs();
    if (properties.customwallpaperfile || properties.customwallpaper?.value === true) syncWallpaperBackground(true);
    if (properties.boot?.value === false && started && mode === "boot") setMode("archive");
    // Keep an already-open settings surface in sync without replacing focused controls.
    document.querySelectorAll<HTMLInputElement>("[data-pref]").forEach(input => {
      const key = input.dataset.pref as "sound" | "music" | "reduced";
      if (key in prefs) input.checked = prefs[key];
    });
    for (const key of ["soundVolume", "musicVolume"] as const) {
      const input = document.querySelector<HTMLInputElement>(`[data-volume="${key}"]`);
      if (input) { input.value = String(Math.round(prefs[key] * 100)); input.closest("label")?.querySelector("output")?.replaceChildren(`${input.value}%`); }
    }
  };
  window.addEventListener("rhine-wallpaper-properties", event => apply((event as CustomEvent<WallpaperProperties>).detail));
  let pausedAt: number | undefined;
  const pause = () => {
    const paused = wallpaperHost()?.paused ?? false;
    if (paused && pausedAt === undefined) pausedAt = performance.now();
    if (!paused && pausedAt !== undefined) {
      if (started && mode === "boot") bootStart += (performance.now() - pausedAt) / 1000;
      pausedAt = undefined;
    }
    audio.setHostPaused(paused);
  };
  window.addEventListener("rhine-wallpaper-pause", pause);
  apply(wallpaperHost()?.properties ?? {});
  pause();
}
if (isWallpaper) {
  workbench = new Workbench($("#stage"), () => {
    if (ready && mode !== "boot") setMode("archive");
  }, lane => {
    if (ready && !modal) select(columnMemory[lane]);
  });
  playground = new ArchivePlayground($("#stage"), () => scene,
    () => ({ enabled: !!workbench?.enabled && mode === "archive" && ready, paused: Boolean(modal) || modalClosing || Boolean(wallpaperHost()?.paused) || document.hidden, reduced: prefs.reduced }),
    value => { musicSuppressed = value; configureAudio(); }, () => audio.play("tick"));
  wallpaperEffects = new WallpaperEffects($("#stage"), () => scene);
  document.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-workbench-mode]");
    if (button) closeModal(() => { workbench!.setEnabled(button.dataset.workbenchMode === "workbench"); });
  });
}
void start();
// Deterministic review controls: the running application, never a video surrogate.
Object.assign(window, {
  rhine: {
    // The review button supplies a real user activation. Preferences stay local to this preview.
    playBootPreview: async (music = false) => {
      if (!ready || !navigator.userActivation.isActive) return false;
      const request = ++audioPreviewRequest;
      audioPreview = true;
      audio.configure({ ...prefs, sound: true, music });
      const unlocked = await audio.unlock();
      if (request !== audioPreviewRequest) return false;
      if (!unlocked) {
        audioPreview = false;
        configureAudio();
        return false;
      }
      replayBoot(true);
      return true;
    },
    seek: (t: number) => {
      setMode("boot");
      bootStart = performance.now() / 1000 - t;
      lastStep = "";
    },
    archive: () => setMode("archive"),
    detail: () => openFile(),
    select: (i: number) => select(i),
    stats: () => ({
      ...scene?.getStats(),
      threeState,
      fps: Math.round(fps),
      mode,
      ready,
      startup: started ? "started" : entry?.phase ?? "loading",
      motion: { reduced: prefs.reduced, systemReduced: matchMedia("(prefers-reduced-motion: reduce)").matches },
      bootTime: mode === "boot" ? started ? (frozenTime ?? performance.now() / 1000 - bootStart) + 5 : 6.76 : null,
      selected: records[selected].id,
      playlists: { active: activePlaylistId, lists: listPlaylists() },
      // 曲库覆盖后的槽位实况；供 check-local-array.mjs 这类检查读取。
      library: {
        ...localSlotState(),
        entries: localEntries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          artist: entry.artist,
          duration: entry.duration,
          cover: Boolean(entry.cover),
          slot: entry.slot ?? null,
        })),
        slots: records.map((record, index) => ({
          index,
          id: record.id,
          title: record.title,
          artist: record.artist,
          category: record.category,
          duration: record.duration,
          file: record.file,
          pending: record.pending,
          cover: Boolean(record.coverUrl),
          localId: record.localId ?? null,
        })),
      },
      audio: audio.stats(),
      wallpaper: isWallpaper ? wallpaperHost() : null,
    }),
  },
});
if (import.meta.hot) import.meta.hot.dispose(() => audio.dispose());

