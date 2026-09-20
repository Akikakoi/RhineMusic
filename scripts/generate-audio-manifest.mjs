// Scans public/audio for extra audio tracks (.ogg / .mp3; everything that is
// not one of the three builtin stems) and writes public/audio/manifest.json. The web app
// merges this manifest into the music player playlist at startup; a missing
// or broken manifest simply falls back to the builtin stems.
// Usage: node scripts/generate-audio-manifest.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const audioDir = join(root, "public", "audio");
const manifestPath = join(audioDir, "manifest.json");

const BUILTIN = new Set(["atmosphere", "motif", "pulse"]);

let previous = { tracks: [] };
if (existsSync(manifestPath)) {
  try {
    previous = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    previous = { tracks: [] };
  }
}
const previousByFile = new Map(
  Array.isArray(previous?.tracks) ? previous.tracks.map((t) => [t.file, t]) : [],
);

const files = readdirSync(audioDir)
  .filter((name) => /\.(ogg|mp3)$/i.test(name))
  .map((name) => (/\.(ogg)$/i.test(name) ? name.replace(/\.(ogg)$/i, "") : name))
  .filter((file) => !BUILTIN.has(file.replace(/\.(ogg|mp3)$/i, "")))
  .sort();

// Keep existing title/subtitle metadata; fill missing entries from the filename.
// .ogg entries are stored without extension (plays as .ogg by default);
// other formats keep their extension so the player picks the right source.
const tracks = files.map((file) => {
  const known = previousByFile.get(file) ?? previousByFile.get(`${file}.ogg`);
  const base = file.replace(/\.(ogg|mp3)$/i, "");
  return {
    file,
    title: known?.title?.trim() || base.toUpperCase(),
    subtitle: known?.subtitle?.trim() ?? "",
  };
});

writeFileSync(manifestPath, `${JSON.stringify({ tracks }, null, 2)}\n`, "utf8");
console.log(`audio manifest: ${tracks.length} extra track(s) -> public/audio/manifest.json`);
