import type { AudioPreferences, MusicState } from "./audio";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch
  ));
const formatTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
};

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
