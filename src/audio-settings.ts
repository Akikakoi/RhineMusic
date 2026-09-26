import type { AudioPreferences, MusicState } from "./audio";
import { displayArtist, type LocalTrackEntry } from "./local-tracks";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch
  ));
const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
};

/** 设置面板里本地曲库区块的界面状态；由 main.ts 维护。 */
export interface LocalLibraryUi {
  supported: boolean;
  busy: boolean;
  error: string;
  editing: string | null;
  confirming: string | null;
  /** 五列阵列占位槽的占用情况；null 表示无法确定（存储不可用）。 */
  slots?: { used: number; capacity: number; remaining: number } | null;
}

const localButtons = (
  id: string,
  actions: (readonly [string, string])[],
) =>
  actions
    .map(
      ([action, label]) =>
        `<button type="button" data-local-action="${action}" data-local-id="${escapeHtml(id)}">${label}</button>`,
    )
    .join("");

function localRowMarkup(
  entry: LocalTrackEntry,
  index: number,
  ui: LocalLibraryUi,
) {
  const id = escapeHtml(entry.id);
  const no = String(index + 1).padStart(2, "0");
  const time = formatTime(entry.duration);
  if (ui.editing === entry.id)
    return `<div class="local-row local-row--edit" role="listitem" data-local-id="${id}">
      <span class="local-no">${no}</span>
      <div class="local-edit">
        <label><span>标题</span><input data-local-field="title" aria-label="曲目标题" autocomplete="off" value="${escapeHtml(entry.title)}"/></label>
        <label><span>歌手</span><input data-local-field="artist" aria-label="曲目歌手" autocomplete="off" value="${escapeHtml(entry.artist)}"/></label>
      </div>
      <span class="local-actions">${localButtons(entry.id, [
        ["edit-save", "保存"],
        ["edit-cancel", "取消"],
      ])}</span>
    </div>`;
  if (ui.confirming === entry.id)
    return `<div class="local-row local-row--confirm" role="listitem" data-local-id="${id}">
      <span class="local-no">${no}</span>
      <span class="local-name"><b>${escapeHtml(entry.title)}</b><small>从本地曲库删除这一条？文件本体也会一并移除。</small></span>
      <span class="local-time">${time}</span>
      <span class="local-actions">${localButtons(entry.id, [
        ["delete-confirm", "确认删除"],
        ["delete-cancel", "取消"],
      ])}</span>
    </div>`;
  return `<div class="local-row" role="listitem" data-local-id="${id}">
      <span class="local-no">${no}</span>
      <span class="local-name"><b>${escapeHtml(entry.title)}</b><small>${escapeHtml(displayArtist(entry.artist))} <i>· LOCAL</i></small></span>
      <span class="local-time">${time}</span>
      <span class="local-actions">${localButtons(entry.id, [
        ["play", "▶ 播放"],
        ["edit", "编辑"],
        ["delete", "删除"],
      ])}</span>
    </div>`;
}

/** 本地曲库区块内容；外层 <section id="local-library"> 由设置面板提供。 */
export function localLibraryMarkup(
  entries: LocalTrackEntry[],
  ui: LocalLibraryUi,
) {
  const slots = ui.slots ?? null;
  const used = slots ? `${slots.used} / ${slots.capacity}` : "";
  const full = Boolean(slots && slots.remaining === 0);
  const summary = `${entries.length} 首本地曲目 · 导入后进入播放列表，并依次填入五列阵列的空占位槽`;
  const status = !ui.supported
    ? "本地曲库不可用：当前浏览器未开放本地存储（隐私模式或已禁用站点数据）。"
    : ui.error || summary;
  // 用量行固定显示，不受错误提示影响；占位槽是本地曲目在阵列里的唯一开销。
  const usageTag = slots && ui.supported
    ? `<p class="local-usage">阵列占位槽已使用 <b>${used}</b>${slots.remaining > 0 ? `，剩 ${slots.remaining} 个空槽` : "（已用尽，删除已有本地曲目后可继续导入）"}</p>`
    : "";
  return `<div class="local-head">
    <div><strong>LOCAL LIBRARY</strong><span>本地曲库 · 导入本机音频文件，保存在此浏览器；导入后按顺序填入五列阵列的空占位槽</span></div>
    <div class="local-import-actions">
      <input id="local-import" type="file" accept="audio/*" multiple hidden/>
      <button type="button" class="local-import" data-local-action="import"${ui.supported && !ui.busy ? "" : " disabled"}>＋ IMPORT <span>导入</span></button>
    </div>
  </div>
  <p class="local-status" data-kind="${!ui.supported || ui.error || full ? "error" : "info"}" role="status">${escapeHtml(status)}</p>
  ${usageTag}
  ${entries.length
      ? `<div class="local-list">${entries.map((entry, index) => localRowMarkup(entry, index, ui)).join("")}</div>`
      : `<p class="local-empty">尚无本地曲目。选择「导入」添加音频文件；文件名按「歌手 - 曲名」解析，导入后依次填入五列阵列的第一个空占位槽，也可以手动编辑标题与歌手。</p>`}`;
}

export function audioSettingsMarkup(prefs: AudioPreferences, music?: MusicState) {
  const state = music;
  const linked = !state || state.track < 0;
  const tracks = state?.tracks ?? [];
  const active = state?.track ?? -1;
  const playing = !!state?.playing;
  const loop = state?.loop ?? "all";
  const progress =
    state && state.duration > 0 ? Math.round((state.time / state.duration) * 1000) : 0;
  const nowTitle =
    active >= 0 && tracks[active] ? tracks[active].title : "";
  const nowSubtitle =
    active >= 0 && tracks[active] ? tracks[active].subtitle : "";
  return `<div class="audio-settings">${(
    [
      ["sound", "soundVolume", "INTERFACE SOUND", "操作与启动音效"],
      ["music", "musicVolume", "BACKGROUND MUSIC", "观测室 · 背景音乐"],
    ] as const
  )
    .map(
      ([toggle, volume, title, description]) => `<div class="audio-setting">
    <label class="audio-toggle"><div><strong>${title}</strong><span>${description}</span></div><input type="checkbox" data-pref="${toggle}" ${prefs[toggle] ? "checked" : ""}/><i class="toggle"></i></label>
    <label class="audio-volume"><span>${toggle === "sound" ? "音效" : "音乐"}音量</span><input aria-label="${toggle === "sound" ? "音效" : "音乐"}音量" data-volume="${volume}" type="range" min="0" max="100" step="1" value="${Math.round(prefs[volume] * 100)}"/><output>${Math.round(prefs[volume] * 100)}%</output></label>
    ${toggle === "music" ? `<div class="music-player">
      <div class="player-modes" role="group" aria-label="播放模式">
        <button type="button" class="player-mode${active === -1 ? " active" : ""}" data-music-mode="linked"><b>SCENE LINK</b><span>场景联动 · 随场景自动变轨</span></button>
        ${tracks
          .map(
            (track, index) =>
              `<button type="button" class="player-mode${active === index ? " active" : ""}" data-music-track="${index}"><b>${escapeHtml(track.title)}</b><span>${escapeHtml(track.subtitle) || `TRACK ${String(index + 1).padStart(2, "0")}`}</span></button>`,
          )
          .join("")}
      </div>
      <div class="player-transport${linked ? " disabled" : ""}">
        <button type="button" data-music-action="prev" aria-label="上一曲" ${linked ? "disabled" : ""}>⏮</button>
        <button type="button" data-music-action="toggle" aria-label="${playing ? "暂停" : "播放"}" ${linked ? "disabled" : ""}>${playing ? "⏸" : "▶"}</button>
        <button type="button" data-music-action="next" aria-label="下一曲" ${linked ? "disabled" : ""}>⏭</button>
        <button type="button" data-music-action="loop" aria-label="循环模式" ${linked ? "disabled" : ""}>↻ ${loop === "one" ? "ONE" : "ALL"}</button>
        <span class="player-now"><b class="player-title">${linked ? "BACKGROUND MUSIC" : `${escapeHtml(nowTitle)}${nowSubtitle ? ` · ${escapeHtml(nowSubtitle)}` : ""}`}</b><output class="player-time">${linked ? "--:--" : formatTime(state?.time ?? 0)}</output></span>
      </div>
      <label class="player-progress${linked ? " hidden" : ""}"><input data-music-seek aria-label="播放进度" type="range" min="0" max="1000" step="1" value="${progress}" ${linked ? "disabled" : ""}/></label>
    </div>` : ""}
  </div>`,
    )
    .join("")}</div>`;
}
