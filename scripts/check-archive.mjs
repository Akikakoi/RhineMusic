import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  records,
  archiveColumns,
  columnFiles,
  fileLocation,
  fileAtSlot,
} from "../src/data.ts";
import {
  cinematicField,
  columnStrength,
  INSPECTION_LIFT,
  returnStep,
  damp,
} from "../src/motion.ts";

assert.equal(records.length, 40);
assert.deepEqual(
  records.map((record) => record.id),
  Array.from({ length: 40 }, (_, i) => `RM-${String(i + 1).padStart(3, "0")}`),
  "Stable RM-001…RM-040 numbering",
);
assert.ok(
  records.every((record) => record.localId === undefined),
  "tracks.json itself never carries local ids: the array is the static 40-slot grid",
);
const slots = new Set();
for (let lane = 0; lane < archiveColumns.length; lane++) {
  const files = columnFiles(lane);
  assert.equal(files.length, 8, "Every column has eight readable files");
  for (const index of files) {
    const location = fileLocation(index);
    assert.equal(location.lane, lane);
    assert.equal(fileAtSlot(location.slot), index);
    assert.ok(location.row >= 0 && location.row < 32);
    slots.add(location.slot);
    const record = records[index];
    assert.equal(record.category, archiveColumns[lane], "Column membership follows the category");
    assert.ok(record.title.trim().length > 0, `${record.id} has a title`);
    assert.ok(record.artist.trim().length > 0, `${record.id} has an artist`);
    // 已入库与占位必须互斥：占位没有音源与时长，已入库两者齐全。
    if (record.pending) {
      assert.equal(record.file, null, `${record.id} is a placeholder without a source`);
      assert.equal(record.duration, null, `${record.id} is a placeholder without a duration`);
    } else {
      assert.ok(
        typeof record.file === "string" && record.file.length > 0,
        `${record.id} names its audio file`,
      );
      assert.ok(
        Number.isFinite(record.duration) && record.duration > 0,
        `${record.id} has a real duration`,
      );
    }
  }
}
assert.equal(slots.size, 40, "No two documents occupy the same slot");
const crests = Array.from({ length: 5 }, (_, lane) =>
  Math.max(
    ...Array.from({ length: 32 }, (_, row) => cinematicField(row, lane, 25.4)),
  ),
);
assert.ok(
  Math.max(...crests) - Math.min(...crests) < 1e-9,
  "Frame 760 crests share the same height",
);
assert.ok(columnStrength(0, 2) >= 0.25, "Other columns retain a visible wave");
assert.ok(columnStrength(2, 2) > columnStrength(1, 2));
let maxDelta = 0;
for (let f = 750; f < 786; f++) {
  for (let row = 0; row < 32; row++)
    for (let lane = 0; lane < 5; lane++) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(
          cinematicField(row, lane, (f + 1) / 25 - 5) -
            cinematicField(row, lane, f / 25 - 5),
        ),
      );
    }
}
assert.ok(
  maxDelta < 0.65,
  "The equal-crest to selected-column handoff is continuous",
);

// Validate against the delivered Blender model, not a duplicate nominal box.
const bytes = await readFile(
  new URL("../public/assets/archive-cassette.glb", import.meta.url),
);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
const box = new THREE.Box3().setFromObject(gltf.scene);
const height = box.max.y - box.min.y;
assert.ok(
  INSPECTION_LIFT - height > 0.25,
  "Inspection clears the adjacent card while staying near the array",
);
assert.ok(INSPECTION_LIFT <= 4.1, "Inspection lift remains modest");
let angle = 0.8,
  elapsed = 0;
while (angle !== 0 && elapsed < 2) {
  angle = returnStep(angle, 1 / 60);
  elapsed += 1 / 60;
}
assert.equal(angle, 0, "Alignment finishes exactly before insertion");
assert.ok(elapsed > 0.5 && elapsed < 1.2);
const coarse = { value: 2, velocity: 0 },
  fine = { ...coarse };
for (let i = 0; i < 30; i++) damp(coarse, 3, 4, 1 / 30);
for (let i = 0; i < 120; i++) damp(fine, 3, 4, 1 / 120);
assert.ok(Math.abs(coarse.value - fine.value) < 1e-9);
console.log(
  JSON.stringify(
    {
      tracks: records.length,
      pendingSlots: records.filter((record) => record.pending).length,
      perColumn: 8,
      crestsAt760: crests,
      maxFrameDelta: maxDelta,
      modelHeight: height,
      inspectionLift: INSPECTION_LIFT,
      alignmentSeconds: elapsed,
      checks: "passed",
    },
    null,
    2,
  ),
);
